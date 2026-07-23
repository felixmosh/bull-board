import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import request from 'supertest';

describe('Scheduled Job Removal', () => {
  let serverAdapter: ExpressAdapter;
  let testQueue: Queue;
  let worker: Worker | undefined;
  let redis: Redis;

  const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: +(process.env.REDIS_PORT || 6379),
  };

  beforeAll(() => {
    redis = new Redis(connection);
  });

  afterAll(() => redis.disconnect());

  beforeEach(async () => {
    serverAdapter = new ExpressAdapter();
    testQueue = new Queue('ScheduledJobTest', { connection });

    // Clear queue before each test
    await testQueue.obliterate({ force: true });

    createBullBoard({
      queues: [new BullMQAdapter(testQueue)],
      serverAdapter,
    });
  });

  afterEach(async () => {
    await worker?.close();
    worker = undefined;
    await testQueue.obliterate({ force: true });
    await testQueue.close();
  });

  /**
   * Runs a scheduler once against a worker that always throws, so the queue ends up holding a
   * failed run of that scheduler plus the pending run for the next iteration.
   */
  async function failOneSchedulerRun(schedulerId: string) {
    await testQueue.upsertJobScheduler(
      schedulerId,
      { every: 60_000 },
      { name: 'failing-task', data: {}, opts: { attempts: 1 } }
    );

    worker = new Worker(
      testQueue.name,
      async (): Promise<any> => {
        throw new Error('intentional failure');
      },
      { connection, autorun: true }
    );

    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const failed = await testQueue.getFailed();
      if (failed.length > 0) {
        await worker.close();
        worker = undefined;
        return failed[0];
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new Error(`Scheduler ${schedulerId} never produced a failed run`);
  }

  describe('Runs produced by a job scheduler', () => {
    it('removes a failed run and leaves the schedule armed', async () => {
      const failedRun = await failOneSchedulerRun('failed-run-keeps-schedule');

      expect(failedRun.repeatJobKey).toBe('failed-run-keeps-schedule');

      await request(serverAdapter.getRouter())
        .put(`/api/queues/${testQueue.name}/${failedRun.id}/clean`)
        .expect(204);

      // The failed run is the only thing that went away.
      expect(await testQueue.getFailed()).toHaveLength(0);
      expect(await testQueue.getJob(failedRun.id as string)).toBeUndefined();

      const schedulers = await testQueue.getJobSchedulers();
      expect(schedulers).toHaveLength(1);
      expect(schedulers[0].key).toBe('failed-run-keeps-schedule');

      // ...and the schedule still has a pending run queued up.
      expect(await testQueue.getDelayed()).toHaveLength(1);
    });

    it('removes a failed run whose scheduler has already been deleted', async () => {
      const failedRun = await failOneSchedulerRun('failed-run-orphaned');

      // Mirrors deleting the schedule from application code and being left with its history.
      await testQueue.removeJobScheduler('failed-run-orphaned');
      expect(await testQueue.getJobSchedulers()).toHaveLength(0);

      await request(serverAdapter.getRouter())
        .put(`/api/queues/${testQueue.name}/${failedRun.id}/clean`)
        .expect(204);

      expect(await testQueue.getFailed()).toHaveLength(0);
      expect(await testQueue.getJob(failedRun.id as string)).toBeUndefined();
    });

    it('refuses to remove the pending run and names the scheduler responsible', async () => {
      const schedulerId = 'pending-run-is-protected';
      const pendingRun = await testQueue.upsertJobScheduler(
        schedulerId,
        { pattern: '0 0 * * *' },
        { name: 'scheduled-task', data: {}, opts: {} }
      );

      if (!pendingRun?.id) {
        throw new Error('Scheduler should have produced a pending run');
      }

      const { body } = await request(serverAdapter.getRouter())
        .put(`/api/queues/${testQueue.name}/${pendingRun.id}/clean`)
        .expect(400);

      expect(body).toMatchObject({
        code: 'JOB_BELONGS_TO_JOB_SCHEDULER',
        jobSchedulerId: schedulerId,
      });

      // Nothing was destroyed on the way out.
      expect(await testQueue.getJobSchedulers()).toHaveLength(1);
      expect(await testQueue.getDelayed()).toHaveLength(1);
      expect(await testQueue.getJob(pendingRun.id)).toBeDefined();
    });
  });

  describe('Removing a job scheduler', () => {
    it('removes the scheduler together with its pending run', async () => {
      const schedulerId = 'scheduler-to-remove';
      const pendingRun = await testQueue.upsertJobScheduler(
        schedulerId,
        { pattern: '0 0 * * *' },
        { name: 'scheduled-task', data: {}, opts: {} }
      );

      if (!pendingRun?.id) {
        throw new Error('Scheduler should have produced a pending run');
      }

      await request(serverAdapter.getRouter())
        .put(`/api/queues/${testQueue.name}/job-schedulers/${schedulerId}/remove`)
        .expect(204);

      expect(await testQueue.getJobSchedulers()).toHaveLength(0);
      expect(await testQueue.getDelayed()).toHaveLength(0);
      expect(await testQueue.getJob(pendingRun.id)).toBeUndefined();

      // No leftovers in Redis for either the run or the schedule.
      const queueKey = `${testQueue.opts.prefix}:${testQueue.name}`;
      expect(await redis.exists(`${queueKey}:${pendingRun.id}`)).toBe(0);
      expect(await redis.zscore(`${queueKey}:repeat`, schedulerId)).toBeNull();
    });

    it('leaves other schedulers alone', async () => {
      await testQueue.upsertJobScheduler(
        'scheduler-one',
        { pattern: '0 0 * * *' },
        { name: 'task-one', data: {}, opts: {} }
      );
      await testQueue.upsertJobScheduler(
        'scheduler-two',
        { every: 3_600_000 },
        { name: 'task-two', data: {}, opts: {} }
      );

      await request(serverAdapter.getRouter())
        .put(`/api/queues/${testQueue.name}/job-schedulers/scheduler-one/remove`)
        .expect(204);

      const remaining = await testQueue.getJobSchedulers();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].key).toBe('scheduler-two');
    });

    it('returns 404 for a scheduler that does not exist', async () => {
      await request(serverAdapter.getRouter())
        .put(`/api/queues/${testQueue.name}/job-schedulers/never-existed/remove`)
        .expect(404);
    });

    it('returns 404 when the same scheduler is removed twice', async () => {
      await testQueue.upsertJobScheduler(
        'remove-me-twice',
        { pattern: '0 0 * * *' },
        { name: 'task', data: {}, opts: {} }
      );

      await request(serverAdapter.getRouter())
        .put(`/api/queues/${testQueue.name}/job-schedulers/remove-me-twice/remove`)
        .expect(204);

      await request(serverAdapter.getRouter())
        .put(`/api/queues/${testQueue.name}/job-schedulers/remove-me-twice/remove`)
        .expect(404);
    });

    it('is rejected on a read only queue', async () => {
      const readOnlyServerAdapter = new ExpressAdapter();
      createBullBoard({
        queues: [new BullMQAdapter(testQueue, { readOnlyMode: true })],
        serverAdapter: readOnlyServerAdapter,
      });

      await testQueue.upsertJobScheduler(
        'read-only-scheduler',
        { pattern: '0 0 * * *' },
        { name: 'task', data: {}, opts: {} }
      );

      await request(readOnlyServerAdapter.getRouter())
        .put(`/api/queues/${testQueue.name}/job-schedulers/read-only-scheduler/remove`)
        .expect(405);

      expect(await testQueue.getJobSchedulers()).toHaveLength(1);
    });
  });

  describe('Regular jobs', () => {
    it('are removed without touching any scheduler', async () => {
      const regularJob = await testQueue.add('regular-task', { data: 'regular' });
      await testQueue.upsertJobScheduler(
        'untouched-scheduler',
        { pattern: '0 0 * * *' },
        { name: 'scheduled-task', data: {}, opts: {} }
      );

      if (!regularJob.id) {
        throw new Error('Regular job should have an id');
      }

      await request(serverAdapter.getRouter())
        .put(`/api/queues/${testQueue.name}/${regularJob.id}/clean`)
        .expect(204);

      expect(await testQueue.getJob(regularJob.id)).toBeUndefined();

      const schedulers = await testQueue.getJobSchedulers();
      expect(schedulers).toHaveLength(1);
      expect(schedulers[0].key).toBe('untouched-scheduler');
    });

    it('returns 404 for a job that no longer exists', async () => {
      const regularJob = await testQueue.add('regular-task', {});

      await request(serverAdapter.getRouter())
        .put(`/api/queues/${testQueue.name}/${regularJob.id}/clean`)
        .expect(204);

      await request(serverAdapter.getRouter())
        .put(`/api/queues/${testQueue.name}/${regularJob.id}/clean`)
        .expect(404);
    });
  });

  describe('Job scheduler metadata', () => {
    it('exposes the scheduler id on every run it produces', async () => {
      const schedulerId = 'metadata-test';
      const pendingRun = await testQueue.upsertJobScheduler(
        schedulerId,
        { pattern: '0 0 * * *' },
        { name: 'metadata-task', data: {}, opts: {} }
      );

      if (!pendingRun?.id) {
        throw new Error('Scheduler should have produced a pending run');
      }

      expect(pendingRun.id).toContain(`repeat:${schedulerId}`);
      expect(pendingRun.toJSON().repeatJobKey).toBe(schedulerId);

      const reloaded = await testQueue.getJob(pendingRun.id);
      expect(reloaded?.repeatJobKey).toBe(schedulerId);
    });
  });
});
