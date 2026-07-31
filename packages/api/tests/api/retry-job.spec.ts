import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue, Worker } from 'bullmq';
import request from 'supertest';

/**
 * Jest's 5s default is too tight for a case that runs a real BullMQ worker against a real
 * Redis. The work itself is milliseconds, but BullMQ retries an internally failed fetch or
 * moveToFailed after `runRetryDelay`, which defaults to 15s, so one transient Redis error on
 * a loaded CI runner stalls the wait for the `failed` event well past 5s. Every other
 * workspace in this repo already sets 30s in its jest config for the same reason; only
 * `packages/api` does not, and this is the only spec here that drives a worker.
 */
jest.setTimeout(30_000);

describe('Retry Job', () => {
  let serverAdapter: ExpressAdapter;
  let testQueue: Queue;
  let worker: Worker;
  const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: +(process.env.REDIS_PORT || 6379),
  };

  beforeEach(async () => {
    serverAdapter = new ExpressAdapter();
    testQueue = new Queue('RetryJobTest', { connection });
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

  async function failAJob(): Promise<string> {
    const job = await testQueue.add('test-job', { foo: 'bar' });

    await new Promise<void>((resolve) => {
      worker = new Worker(
        'RetryJobTest',
        async (): Promise<void> => {
          throw new Error('deliberate failure');
        },
        { connection }
      );
      worker.on('failed', () => resolve());
    });

    return job.id!;
  }

  it('should retry a failed job and move it back to waiting', async () => {
    const jobId = await failAJob();
    await worker.close();
    const agent = setupBoard();

    await agent.put(`/api/queues/${testQueue.name}/${jobId}/retry`).expect(204);

    const job = await testQueue.getJob(jobId);
    expect(await job!.getState()).toBe('waiting');
  });

  it('should return 400 when job is not in a retriable state', async () => {
    const job = await testQueue.add('waiting-job', { foo: 'bar' });
    const agent = setupBoard();

    const res = await agent.put(`/api/queues/${testQueue.name}/${job.id}/retry`).expect(400);
    expect(JSON.parse(res.text).error).toEqual({
      key: 'ERRORS.JOB_NOT_RETRIABLE',
      options: { state: 'waiting' },
    });
  });

  it('should return 404 for a non-existent job', async () => {
    const agent = setupBoard();
    await agent.put(`/api/queues/${testQueue.name}/non-existent-job/retry`).expect(404);
  });

  it('should return 405 in read-only mode', async () => {
    const jobId = await failAJob();
    const agent = setupBoard({ readOnlyMode: true });

    await agent.put(`/api/queues/${testQueue.name}/${jobId}/retry`).expect(405);
  });
});
