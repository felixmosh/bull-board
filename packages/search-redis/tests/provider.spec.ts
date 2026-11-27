import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { createRedisSearchProvider } from '../src/createRedisSearchProvider';
import { RedisSearchIndex } from '../src/RedisSearchIndex';
import { connection } from './connection';

describe('createRedisSearchProvider', () => {
  let redis: IORedis;
  let queue: Queue;
  let index: RedisSearchIndex;
  let prefix: string;

  beforeAll(async () => {
    redis = new IORedis({ ...connection, maxRetriesPerRequest: null });
  });

  afterAll(async () => {
    await redis.quit();
  });

  beforeEach(async () => {
    const suffix = Math.random().toString(36).slice(2, 10);
    prefix = `provider-test-${suffix}`;
    queue = new Queue(`provider-queue-${suffix}`, { connection });
    await queue.waitUntilReady();
    index = new RedisSearchIndex({
      connection: redis,
      queue,
      fields: { name: 'name', tenant: 'data.tenant' },
      prefix,
    });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await queue.obliterate({ force: true });
    await queue.close();
    const keys = await redis.keys(`${prefix}*`);
    if (keys.length > 0) await redis.del(...keys);
  });

  it('lists the fields in definition order', async () => {
    const provider = createRedisSearchProvider(index);
    expect(await provider.fields()).toEqual(['name', 'tenant']);
  });

  it('returns nothing for an unknown field', async () => {
    const provider = createRedisSearchProvider(index);
    expect(await provider.search({ field: 'nope', value: 'x', limit: 5 })).toEqual({ jobIds: [] });
  });

  it('checks the state of one page of candidates per search', async () => {
    const jobs = [];
    for (let i = 0; i < 62; i++) {
      jobs.push(await queue.add('job', { tenant: 'acme' }, { timestamp: 1000 + i } as never));
    }
    const failedIds = new Set([jobs[0].id, jobs[1].id]);
    await index.indexJobs(jobs);
    const getJobState = jest
      .spyOn(queue, 'getJobState')
      .mockImplementation(async (id: string) => (failedIds.has(id) ? 'failed' : 'completed'));
    const provider = createRedisSearchProvider(index);

    const first = await provider.search({
      field: 'tenant',
      value: 'acme',
      status: 'failed',
      limit: 5,
    });
    expect(first).toEqual({ jobIds: [], cursor: expect.any(String) });
    expect(getJobState).toHaveBeenCalledTimes(5);

    const found: string[] = [];
    let cursor = first.cursor;
    while (cursor) {
      getJobState.mockClear();
      const page = await provider.search({
        field: 'tenant',
        value: 'acme',
        status: 'failed',
        cursor,
        limit: 5,
      });
      expect(getJobState.mock.calls.length).toBeLessThanOrEqual(5);
      found.push(...page.jobIds);
      cursor = page.cursor;
    }
    expect(found).toEqual([jobs[1].id, jobs[0].id]);
  });

  it('returns a cursor while candidates remain', async () => {
    const jobs = [];
    for (let i = 0; i < 12; i++) {
      jobs.push(await queue.add('job', { tenant: 'acme' }, { timestamp: 1000 + i } as never));
    }
    await index.indexJobs(jobs);
    jest.spyOn(queue, 'getJobState').mockResolvedValue('waiting');
    const provider = createRedisSearchProvider(index);

    const page = await provider.search({
      field: 'tenant',
      value: 'acme',
      status: 'waiting',
      limit: 5,
    });
    expect(page.jobIds).toHaveLength(5);
    expect(page.cursor).toBeDefined();
  });

  const bullmqMajor = Number(
    (require('bullmq/package.json') as { version: string }).version.split('.')[0]
  );
  const itOnV5 = bullmqMajor === 5 ? it : it.skip;

  itOnV5('filters a paused queue by paused and by waiting', async () => {
    await queue.pause();
    const jobs = [];
    for (let i = 0; i < 3; i++) {
      jobs.push(await queue.add('job', { tenant: 'acme' }, { timestamp: 1000 + i } as never));
    }
    await index.indexJobs(jobs);
    const provider = createRedisSearchProvider(index);
    const expected = jobs.map((job) => job.id).reverse();

    for (const status of ['paused', 'waiting'] as const) {
      const result = await provider.search({ field: 'tenant', value: 'acme', status, limit: 10 });
      expect(result.jobIds).toEqual(expected);
    }
    expect(
      (await provider.search({ field: 'tenant', value: 'acme', status: 'failed', limit: 10 }))
        .jobIds
    ).toEqual([]);
  });
});
