import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import request from 'supertest';

describe('Redis stats', () => {
  const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: +(process.env.REDIS_PORT || 6379),
  };

  let queue: Queue;

  beforeEach(async () => {
    queue = new Queue('StatsQueue', { connection });
    await queue.waitUntilReady();
  });

  afterEach(async () => {
    await queue.obliterate({ force: true }).catch(() => undefined);
    await queue.close();
  });

  function setupBoard(adapter: BullMQAdapter) {
    const serverAdapter = new ExpressAdapter();
    createBullBoard({ queues: [adapter], serverAdapter });
    return request(serverAdapter.getRouter());
  }

  it('labels a redis-backed queue as such', async () => {
    const res = await setupBoard(new BullMQAdapter(queue)).get('/api/redis/stats').expect(200);

    expect(res.body.backend).toBe('redis');
    expect(res.body.memory.used).toEqual(expect.any(Number));
  });

  it('answers with a translatable error when the datastore can say nothing', async () => {
    // No real backend behaves this way today: BullMQ v6 on PostgreSQL reports its own stats,
    // and everything else is Redis. This covers whatever datastore BullMQ adds next.
    const adapter = new BullMQAdapter(queue);
    jest.spyOn(adapter, 'getRedisInfo').mockResolvedValue(null);
    jest.spyOn(adapter, 'getDatastoreStats').mockResolvedValue(null);

    const res = await setupBoard(adapter).get('/api/redis/stats').expect(404);

    expect(res.body.error).toEqual({ key: 'ERRORS.REDIS_STATS_UNAVAILABLE' });
  });
});
