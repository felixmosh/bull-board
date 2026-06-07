import { Queue } from 'bullmq';
import request from 'supertest';

import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

describe('metrics', () => {
  let serverAdapter: ExpressAdapter;
  const queueList: Queue[] = [];
  const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: +(process.env.REDIS_PORT || 6379),
  };

  beforeEach(() => {
    serverAdapter = new ExpressAdapter();
    queueList.length = 0;
  });

  afterEach(async () => {
    for (const queue of queueList) {
      await queue.obliterate({ force: true }).catch(() => undefined);
      await queue.close();
    }
  });

  it('should expose completed and failed metrics for a queue', async () => {
    const metricsQueue = new Queue('MetricsQueue', { connection });
    queueList.push(metricsQueue);

    createBullBoard({ queues: [new BullMQAdapter(metricsQueue)], serverAdapter });

    await request(serverAdapter.getRouter())
      .get(`/api/queues/${metricsQueue.name}/metrics`)
      .expect('Content-Type', /json/)
      .expect(200)
      .then((res) => {
        const body = JSON.parse(res.text);
        expect(body).toHaveProperty('completed');
        expect(body).toHaveProperty('failed');
        expect(Array.isArray(body.completed.data)).toBe(true);
        expect(Array.isArray(body.failed.data)).toBe(true);
      });
  });

  it('should return 404 for an unknown queue', async () => {
    const metricsQueue = new Queue('KnownQueue', { connection });
    queueList.push(metricsQueue);

    createBullBoard({ queues: [new BullMQAdapter(metricsQueue)], serverAdapter });

    await request(serverAdapter.getRouter())
      .get('/api/queues/UnknownQueue/metrics')
      .expect('Content-Type', /json/)
      .expect(404);
  });
});
