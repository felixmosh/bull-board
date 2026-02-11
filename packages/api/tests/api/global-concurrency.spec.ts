import { Queue } from '@sinianluoye/bullmq';
import request from 'supertest';

import { createBullBoard } from '@sinianluoye/bull-board-api';
import { BullMQAdapter } from '@sinianluoye/bull-board-api/bullMQAdapter';
import { ExpressAdapter } from '@sinianluoye/bull-board-express';

describe('Global Concurrency', () => {
  let serverAdapter: ExpressAdapter;
  let testQueue: Queue;
  const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: +(process.env.REDIS_PORT || 6379),
  };

  beforeEach(async () => {
    serverAdapter = new ExpressAdapter();
    testQueue = new Queue('ConcurrencyTest', { connection });
    await testQueue.removeGlobalConcurrency();
  });

  afterEach(async () => {
    try {
      await testQueue.obliterate({ force: true });
    } catch (_error) {
      // Queue might already be obliterated
    }
    await testQueue.close();
  });

  it('should return globalConcurrency as null when not set', async () => {
    createBullBoard({
      queues: [new BullMQAdapter(testQueue)],
      serverAdapter,
    });

    await request(serverAdapter.getRouter())
      .get('/api/queues')
      .expect(200)
      .then((res) => {
        const queues = JSON.parse(res.text).queues;
        expect(queues[0].globalConcurrency).toBeNull();
      });
  });

  it('should set global concurrency', async () => {
    createBullBoard({
      queues: [new BullMQAdapter(testQueue)],
      serverAdapter,
    });

    await request(serverAdapter.getRouter())
      .put(`/api/queues/${testQueue.name}/concurrency`)
      .send({ concurrency: 5 })
      .expect(200);

    await request(serverAdapter.getRouter())
      .get('/api/queues')
      .expect(200)
      .then((res) => {
        const queues = JSON.parse(res.text).queues;
        expect(queues[0].globalConcurrency).toBe(5);
      });
  });

  it('should remove global concurrency when set to 0', async () => {
    await testQueue.setGlobalConcurrency(10);

    createBullBoard({
      queues: [new BullMQAdapter(testQueue)],
      serverAdapter,
    });

    await request(serverAdapter.getRouter())
      .put(`/api/queues/${testQueue.name}/concurrency`)
      .send({ concurrency: 0 })
      .expect(200);

    await request(serverAdapter.getRouter())
      .get('/api/queues')
      .expect(200)
      .then((res) => {
        const queues = JSON.parse(res.text).queues;
        expect(queues[0].globalConcurrency).toBeNull();
      });
  });

  it('should return 400 for negative concurrency', async () => {
    createBullBoard({
      queues: [new BullMQAdapter(testQueue)],
      serverAdapter,
    });

    await request(serverAdapter.getRouter())
      .put(`/api/queues/${testQueue.name}/concurrency`)
      .send({ concurrency: -1 })
      .expect(400)
      .then((res) => {
        const body = JSON.parse(res.text);
        expect(body.error).toBe('Invalid concurrency value');
      });
  });

  it('should return 400 for non-integer concurrency', async () => {
    createBullBoard({
      queues: [new BullMQAdapter(testQueue)],
      serverAdapter,
    });

    await request(serverAdapter.getRouter())
      .put(`/api/queues/${testQueue.name}/concurrency`)
      .send({ concurrency: 2.5 })
      .expect(400);
  });

  it('should return 400 for non-number concurrency', async () => {
    createBullBoard({
      queues: [new BullMQAdapter(testQueue)],
      serverAdapter,
    });

    await request(serverAdapter.getRouter())
      .put(`/api/queues/${testQueue.name}/concurrency`)
      .send({ concurrency: 'high' })
      .expect(400);
  });

  it('should return 405 in read-only mode', async () => {
    createBullBoard({
      queues: [new BullMQAdapter(testQueue, { readOnlyMode: true })],
      serverAdapter,
    });

    await request(serverAdapter.getRouter())
      .put(`/api/queues/${testQueue.name}/concurrency`)
      .send({ concurrency: 5 })
      .expect(405);
  });

  it('should return 404 for non-existent queue', async () => {
    createBullBoard({
      queues: [new BullMQAdapter(testQueue)],
      serverAdapter,
    });

    await request(serverAdapter.getRouter())
      .put('/api/queues/NonExistentQueue/concurrency')
      .send({ concurrency: 5 })
      .expect(404);
  });
});
