import { Queue } from 'bullmq';
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

  it('reports degraded with pending retries', async () => {
    await startIndexer();
    await redis.sadd(index.keys.retry, 'stuck');

    const status = await diagnostics().status();
    expect(status.health).toBe('degraded');
    expect(status.reasons).toEqual(['PENDING_RETRIES']);
    expect(status.pendingRetries).toBe(1);
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
