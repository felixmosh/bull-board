import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { formatJob } from '@bull-board/api/dist/handlers/queues';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import request from 'supertest';
import type { QueueJob } from '../../typings/app';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: +(process.env.REDIS_PORT || 6379),
};

function fakeJob(props: Record<string, any>): QueueJob {
  return {
    opts: {},
    toJSON: () => ({
      id: '1',
      name: 'test',
      data: {},
      opts: {},
      progress: 0,
      attemptsMade: 0,
      timestamp: Date.now(),
      failedReason: '',
      stacktrace: [],
      returnvalue: null,
      ...props,
    }),
  } as unknown as QueueJob;
}

describe('job diagnostics', () => {
  let queue: Queue;
  let serverAdapter: ExpressAdapter;
  let adapter: BullMQAdapter;

  beforeEach(async () => {
    queue = new Queue('DiagnosticsQueue', { connection });
    await queue.obliterate({ force: true });
    adapter = new BullMQAdapter(queue);
    serverAdapter = new ExpressAdapter();
    createBullBoard({ queues: [adapter], serverAdapter });
  });

  afterEach(async () => {
    await queue.obliterate({ force: true }).catch(() => undefined);
    await queue.close();
  });

  it('carries priority and deduplicationId from a real BullMQ job', async () => {
    await queue.add(
      'welcome',
      { to: 'a@b.c' },
      { priority: 7, deduplication: { id: 'welcome-a' } }
    );

    const res = await request(serverAdapter.getRouter())
      .get('/api/queues')
      .query({ activeQueue: 'DiagnosticsQueue', status: 'prioritized' })
      .expect(200);

    const [job] = JSON.parse(res.text).queues[0].jobs;

    expect(job.priority).toBe(7);
    expect(job.deduplicationId).toBe('welcome-a');
  });

  it('carries the fields a stalled or deferred job sets', () => {
    const job = formatJob(
      fakeJob({
        attemptsMade: 1,
        attemptsStarted: 3,
        stalledCounter: 2,
        deferredFailure: 'cancelled upstream',
      }),
      adapter
    );

    expect(job).toMatchObject({
      attemptsStarted: 3,
      stalledCounter: 2,
      deferredFailure: 'cancelled upstream',
    });
  });

  it('omits every diagnostic a job has not actually set', () => {
    const job = formatJob(
      fakeJob({ priority: 0, attemptsStarted: 0, stalledCounter: 0, deferredFailure: '' }),
      adapter
    );

    expect(job).not.toHaveProperty('priority');
    expect(job).not.toHaveProperty('attemptsStarted');
    expect(job).not.toHaveProperty('stalledCounter');
    expect(job).not.toHaveProperty('deferredFailure');
    expect(job).not.toHaveProperty('deduplicationId');
  });

  it('omits attemptsStarted while it still matches attemptsMade', () => {
    const job = formatJob(fakeJob({ attemptsMade: 2, attemptsStarted: 2 }), adapter);

    expect(job).not.toHaveProperty('attemptsStarted');
  });

  it('omits them for a Bull job, which reports none of them', () => {
    expect(formatJob(fakeJob({}), adapter)).not.toHaveProperty('stalledCounter');
  });
});
