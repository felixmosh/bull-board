import { Queue } from 'bullmq';
import request from 'supertest';

import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

describe('Pause/Resume Queue', () => {
  let serverAdapter: ExpressAdapter;
  let testQueue: Queue;
  const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: +(process.env.REDIS_PORT || 6379),
  };

  beforeEach(async () => {
    serverAdapter = new ExpressAdapter();
    testQueue = new Queue('PauseResumeTest', { connection });
    await testQueue.obliterate({ force: true }).catch(() => {});
  });

  afterEach(async () => {
    try {
      await testQueue.obliterate({ force: true });
    } catch (_error) {
      // Queue might already be obliterated
    }
    await testQueue.close();
  });

  function setupBoard(options: Partial<{ readOnlyMode: boolean }> = {}) {
    createBullBoard({
      queues: [new BullMQAdapter(testQueue, options)],
      serverAdapter,
    });
    return request(serverAdapter.getRouter());
  }

  describe('Pause', () => {
    it('should pause an active queue', async () => {
      const agent = setupBoard();

      await agent.put(`/api/queues/${testQueue.name}/pause`).expect(200);

      expect(await testQueue.isPaused()).toBe(true);
    });

    it('should return 405 in read-only mode', async () => {
      const agent = setupBoard({ readOnlyMode: true });

      await agent.put(`/api/queues/${testQueue.name}/pause`).expect(405);
    });

    it('should reflect isPaused in the queues list after pausing', async () => {
      const agent = setupBoard();

      await agent.put(`/api/queues/${testQueue.name}/pause`).expect(200);

      const res = await agent.get('/api/queues').expect(200);
      const queue = res.body.queues.find((q: any) => q.name === testQueue.name);
      expect(queue.isPaused).toBe(true);
    });
  });

  describe('Resume', () => {
    it('should resume a paused queue', async () => {
      await testQueue.pause();
      expect(await testQueue.isPaused()).toBe(true);

      const agent = setupBoard();
      await agent.put(`/api/queues/${testQueue.name}/resume`).expect(200);

      expect(await testQueue.isPaused()).toBe(false);
    });

    it('should return 405 in read-only mode', async () => {
      await testQueue.pause();
      const agent = setupBoard({ readOnlyMode: true });

      await agent.put(`/api/queues/${testQueue.name}/resume`).expect(405);
    });

    it('should reflect isPaused=false in the queues list after resuming', async () => {
      await testQueue.pause();
      const agent = setupBoard();

      await agent.put(`/api/queues/${testQueue.name}/resume`).expect(200);

      const res = await agent.get('/api/queues').expect(200);
      const queue = res.body.queues.find((q: any) => q.name === testQueue.name);
      expect(queue.isPaused).toBe(false);
    });
  });
});
