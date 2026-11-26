import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import request from 'supertest';
import { createRedisSearchProvider } from '../src/createRedisSearchProvider';
import { RedisSearchIndex } from '../src/RedisSearchIndex';
import { SearchIndexer } from '../src/SearchIndexer';
import { connection } from './connection';
import { until } from './until';

describe('board with the Redis search provider', () => {
  let redis: IORedis;
  let queue: Queue;
  let index: RedisSearchIndex;
  let indexer: SearchIndexer;
  let prefix: string;
  let app: ReturnType<typeof request>;
  let ids: string[];

  beforeAll(async () => {
    redis = new IORedis({ ...connection, maxRetriesPerRequest: null });
    const suffix = Math.random().toString(36).slice(2, 10);
    prefix = `e2e-test-${suffix}`;
    queue = new Queue(`orders-${suffix}`, { connection });
    await queue.waitUntilReady();
    await queue.pause();
    index = new RedisSearchIndex({
      connection: redis,
      queue,
      fields: { 'data.tenantId': 'data.tenantId' },
      prefix,
    });
    indexer = new SearchIndexer(index, { connection });
    await indexer.start();

    const jobs = await queue.addBulk([
      { name: 'order', data: { tenantId: 'acme' } },
      { name: 'order', data: { tenantId: 'acme' } },
      { name: 'order', data: { tenantId: 'globex' } },
    ]);
    ids = jobs.map((job) => job.id as string);
    await until(async () => (await index.known(ids)).every(Boolean));

    const serverAdapter = new ExpressAdapter();
    createBullBoard({
      queues: [new BullMQAdapter(queue, { search: createRedisSearchProvider(index) })],
      serverAdapter,
    });
    app = request(serverAdapter.getRouter());
  });

  afterAll(async () => {
    await indexer.stop();
    await queue.obliterate({ force: true });
    await queue.close();
    const keys = await redis.keys(`${prefix}*`);
    if (keys.length > 0) await redis.del(...keys);
    await redis.quit();
  });

  it('searches the indexed jobs', async () => {
    const res = await app
      .get(`/api/queues/${queue.name}/search`)
      .query({ field: 'data.tenantId', value: 'acme' })
      .expect(200);

    expect(res.body.results.map((result: any) => result.job.id).sort()).toEqual(
      [ids[0], ids[1]].sort()
    );
  });

  it('reports ok health while the indexer runs', async () => {
    const status = () => app.get(`/api/queues/${queue.name}/search/status`).expect(200);
    await until(async () => (await status()).body.reasons.length === 0);

    expect((await status()).body.health).toBe('ok');
  });

  it('inspects how a job is indexed', async () => {
    const res = await app.get(`/api/queues/${queue.name}/search/jobs/${ids[2]}`).expect(200);

    expect(JSON.stringify(res.body)).toContain('globex');
  });

  it('finds no missing jobs after indexing', async () => {
    const res = await app.get(`/api/queues/${queue.name}/search/coverage`).expect(200);

    expect(res.body.missing).toEqual([]);
  });
});
