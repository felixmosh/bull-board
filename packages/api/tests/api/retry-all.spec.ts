import { Queue, Worker } from 'bullmq';
import request from 'supertest';

import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

describe('Retry All', () => {
  let serverAdapter: ExpressAdapter;
  let testQueue: Queue;
  let worker: Worker;
  const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: +(process.env.REDIS_PORT || 6379),
  };

  beforeEach(async () => {
    serverAdapter = new ExpressAdapter();
    testQueue = new Queue('RetryAllTest', { connection });
    await testQueue.obliterate({ force: true }).catch(() => {});
  });

  afterEach(async () => {
    if (worker) {
      await worker.close();
    }
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

  async function failMultipleJobs(count: number): Promise<string[]> {
    const jobs = await Promise.all(
      Array.from({ length: count }, (_, i) => testQueue.add(`test-job-${i}`, { index: i }))
    );

    let failedCount = 0;
    await new Promise<void>((resolve) => {
      worker = new Worker(
        'RetryAllTest',
        async (): Promise<void> => {
          throw new Error('deliberate failure');
        },
        { connection }
      );
      worker.on('failed', () => {
        failedCount++;
        if (failedCount >= count) resolve();
      });
    });

    return jobs.map((job) => job.id!);
  }

  it('should retry all failed jobs', async () => {
    const jobIds = await failMultipleJobs(3);
    await worker.close();
    const agent = setupBoard();

    await agent.put(`/api/queues/${testQueue.name}/retry/failed`).expect(200);

    for (const jobId of jobIds) {
      const job = await testQueue.getJob(jobId);
      expect(await job!.getState()).toBe('waiting');
    }
  });

  it('should return 400 for non-retriable status', async () => {
    const agent = setupBoard();

    const res = await agent.put(`/api/queues/${testQueue.name}/retry/active`).expect(400);
    expect(JSON.parse(res.text).error).toContain('not a retriable status');
  });

  it('should return 405 in read-only mode', async () => {
    const agent = setupBoard({ readOnlyMode: true });

    await agent.put(`/api/queues/${testQueue.name}/retry/failed`).expect(405);
  });
});
