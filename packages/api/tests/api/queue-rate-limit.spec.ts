import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import Bull from 'bull';
import { Queue } from 'bullmq';
import request from 'supertest';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: +(process.env.REDIS_PORT || 6379),
};

describe('queue rate limit', () => {
  let queue: Queue;
  let serverAdapter: ExpressAdapter;

  beforeEach(async () => {
    queue = new Queue('RateLimitQueue', { connection });
    await queue.obliterate({ force: true });
    serverAdapter = new ExpressAdapter();
    createBullBoard({ queues: [new BullMQAdapter(queue)], serverAdapter });
  });

  afterEach(async () => {
    await queue.obliterate({ force: true }).catch(() => undefined);
    await queue.close();
  });

  it('round trips the configured limit through the API', async () => {
    const agent = request(serverAdapter.getRouter());

    await agent
      .put('/api/queues/RateLimitQueue/rate-limit')
      .send({ max: 5, duration: 1000 })
      .expect(200);

    const res = await agent.get('/api/queues/RateLimitQueue/rate-limit').expect(200);
    expect(JSON.parse(res.text)).toEqual({
      supported: true,
      rateLimit: { max: 5, duration: 1000 },
    });

    expect(await queue.getGlobalRateLimit()).toEqual({ max: 5, duration: 1000 });
  });

  it('removes the configured limit when the body carries no max', async () => {
    const agent = request(serverAdapter.getRouter());
    await queue.setGlobalRateLimit(5, 1000);

    await agent.put('/api/queues/RateLimitQueue/rate-limit').send({}).expect(200);

    expect(await queue.getGlobalRateLimit()).toBeNull();
  });

  it.each([
    ['a zero max', { max: 0, duration: 1000 }],
    ['a negative duration', { max: 5, duration: -1 }],
    ['a fractional max', { max: 1.5, duration: 1000 }],
    ['a missing duration', { max: 5 }],
  ])('rejects %s', async (_label, body) => {
    const res = await request(serverAdapter.getRouter())
      .put('/api/queues/RateLimitQueue/rate-limit')
      .send(body)
      .expect(400);

    expect(JSON.parse(res.text).error).toEqual({ key: 'ERRORS.INVALID_RATE_LIMIT' });
  });

  it('reports the ttl of a limit a worker has tripped, and releases it', async () => {
    await queue.setGlobalRateLimit(1, 60000);
    await queue.rateLimit(60000);

    const agent = request(serverAdapter.getRouter());

    const listed = await agent
      .get('/api/queues')
      .query({ activeQueue: 'RateLimitQueue' })
      .expect(200);
    expect(JSON.parse(listed.text).queues[0].activeRateLimitTtl).toBeGreaterThan(0);

    await agent.put('/api/queues/RateLimitQueue/rate-limit/release').expect(200);

    const after = await agent
      .get('/api/queues')
      .query({ activeQueue: 'RateLimitQueue' })
      .expect(200);
    expect(JSON.parse(after.text).queues[0].activeRateLimitTtl).toBe(0);
  });

  it('advertises no support on Bull, and refuses to set one', async () => {
    const bullQueue = new Bull('BullRateLimitQueue', { redis: connection });
    const bullServerAdapter = new ExpressAdapter();
    createBullBoard({ queues: [new BullAdapter(bullQueue)], serverAdapter: bullServerAdapter });

    const agent = request(bullServerAdapter.getRouter());

    const res = await agent.get('/api/queues/BullRateLimitQueue/rate-limit').expect(200);
    expect(JSON.parse(res.text)).toEqual({ supported: false, rateLimit: null });

    const rejected = await agent
      .put('/api/queues/BullRateLimitQueue/rate-limit')
      .send({ max: 5, duration: 1000 })
      .expect(400);
    expect(JSON.parse(rejected.text).error).toEqual({ key: 'ERRORS.RATE_LIMIT_NOT_SUPPORTED' });

    const listed = await agent
      .get('/api/queues')
      .query({ activeQueue: 'BullRateLimitQueue' })
      .expect(200);
    expect(JSON.parse(listed.text).queues[0].supportsGlobalRateLimit).toBe(false);

    await bullQueue.close();
  });
});
