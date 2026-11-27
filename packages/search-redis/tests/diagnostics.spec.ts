import { Job, Queue } from 'bullmq';
import IORedis from 'ioredis';
import { createRedisSearchProvider } from '../src/createRedisSearchProvider';
import { RedisSearchIndex } from '../src/RedisSearchIndex';
import { SearchIndexer } from '../src/SearchIndexer';
import { connection } from './connection';
import { until } from './until';

describe('diagnostics', () => {
  let redis: IORedis;
  let queue: Queue;
  let index: RedisSearchIndex;
  let prefix: string;
  let indexers: SearchIndexer[];

  beforeAll(async () => {
    redis = new IORedis({ ...connection, maxRetriesPerRequest: null });
  });

  afterAll(async () => {
    await redis.quit();
  });

  beforeEach(async () => {
    const suffix = Math.random().toString(36).slice(2, 10);
    prefix = `diagnostics-test-${suffix}`;
    queue = new Queue(`diagnostics-queue-${suffix}`, { connection });
    await queue.waitUntilReady();
    index = new RedisSearchIndex({
      connection: redis,
      queue,
      fields: { tenant: 'data.tenant' },
      prefix,
    });
    indexers = [];
  });

  afterEach(async () => {
    await Promise.all(indexers.map((indexer) => indexer.stop()));
    await queue.obliterate({ force: true });
    await queue.close();
    const keys = await redis.keys(`${prefix}*`);
    if (keys.length > 0) await redis.del(...keys);
  });

  const startIndexer = async () => {
    const indexer = new SearchIndexer(index, {
      connection,
      backfillOnStart: false,
      sweepEvery: false,
    });
    indexers.push(indexer);
    await indexer.start();
    return indexer;
  };

  const diagnostics = () => createRedisSearchProvider(index).diagnostics!;

  it('reports down when the indexer never ran', async () => {
    const status = await diagnostics().status();
    expect(status.health).toBe('down');
    expect(status.reasons).toEqual(['INDEXER_NEVER_STARTED']);
  });

  it('reports ok while the indexer runs', async () => {
    await startIndexer();
    const job = await queue.add('job', { tenant: 'acme' });
    await until(async () => (await index.known([job.id as string]))[0]);

    const status = await diagnostics().status();
    expect(status.health).toBe('ok');
    expect(status.reasons).toEqual([]);
    expect(status.indexedJobs).toBe(await redis.zcard(index.keys.all));
    expect(Date.now() - (status.indexerLastSeenAt as number)).toBeLessThan(10000);
  });

  it('reports down after the heartbeat expires', async () => {
    await startIndexer();
    await redis.del(index.keys.heartbeat);

    const status = await diagnostics().status();
    expect(status.health).toBe('down');
    expect(status.reasons).toEqual(['INDEXER_NOT_SEEN']);
  });

  it('reports down when the heartbeat has not been renewed for two intervals', async () => {
    await startIndexer();
    await redis.set(index.keys.heartbeat, String(Date.now()), 'PX', 15000);

    const status = await diagnostics().status();
    expect(status.health).toBe('down');
    expect(status.reasons).toEqual(['INDEXER_NOT_SEEN']);
  });

  it('reports degraded with pending retries', async () => {
    await startIndexer();
    await redis.sadd(index.keys.retry, 'stuck');

    const status = await diagnostics().status();
    expect(status.health).toBe('degraded');
    expect(status.reasons).toEqual(['PENDING_RETRIES']);
    expect(status.pendingRetries).toBe(1);
  });

  it('retries the status read while its slot is being moved', async () => {
    await startIndexer();
    const original = redis.multi.bind(redis);
    const multi = jest.spyOn(redis, 'multi').mockImplementationOnce(() => {
      const failing = original();
      failing.exec = async () => {
        throw new Error('TRYAGAIN Multiple keys request during rehashing of slot');
      };
      return failing;
    });

    const status = await diagnostics().status();

    multi.mockRestore();
    expect(status.health).toBe('ok');
  });

  it('reports degraded when the indexer indexes other fields than the board', async () => {
    await startIndexer();
    const board = new RedisSearchIndex({
      connection: redis,
      queue,
      fields: { tenant: 'data.tenant', email: 'data.email' },
      prefix,
    });

    const status = await createRedisSearchProvider(board).diagnostics!.status();

    expect(status.health).toBe('degraded');
    expect(status.reasons).toEqual(['FIELDS_MISMATCH']);
    expect((await diagnostics().status()).health).toBe('ok');
  });

  it('coverage finds a job removed from the index', async () => {
    const jobs = [];
    for (let i = 0; i < 5; i++) jobs.push(await queue.add('job', { tenant: 'acme' }));
    await index.indexJobs(jobs);
    await index.removeJob(jobs[2].id as string);

    const coverage = await diagnostics().checkCoverage!({ sample: 50 });
    expect(coverage.checked).toBe(5);
    expect(coverage.missing).toEqual([jobs[2].id]);
  });

  it('coverage does not report jobs the indexer reaches within a second', async () => {
    const jobs: Job[] = [];
    for (let i = 0; i < 5; i++) jobs.push(await queue.add('job', { tenant: 'acme' }));
    await index.indexJobs(jobs.slice(0, 3));
    const late = setTimeout(() => void index.indexJob(jobs[3]), 200);

    const coverage = await diagnostics().checkCoverage!({ sample: 50 });
    clearTimeout(late);
    expect(coverage.checked).toBe(5);
    expect(coverage.missing).toEqual([jobs[4].id]);
  });

  it('inspect reports a field that changed before reindex', async () => {
    const job = await queue.add('job', { tenant: 'acme' });
    await index.indexJob(job);
    await job.updateData({ tenant: 'globex' });

    const inspection = await diagnostics().inspect!(job.id as string);
    expect(inspection.fields).toEqual([{ field: 'tenant', values: ['globex'], indexed: false }]);
  });

  it('inspect reports a missing job as not indexed', async () => {
    const inspection = await diagnostics().inspect!('missing');
    expect(inspection.fields).toEqual([{ field: 'tenant', values: [], indexed: false }]);
  });
});
