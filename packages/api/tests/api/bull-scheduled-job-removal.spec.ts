import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { ExpressAdapter } from '@bull-board/express';
import Queue from 'bull';
import request from 'supertest';

jest.setTimeout(30_000);

describe('Bull scheduled job removal', () => {
  let serverAdapter: ExpressAdapter;
  let testQueue: Queue.Queue;

  const redis = {
    host: process.env.REDIS_HOST || 'localhost',
    port: +(process.env.REDIS_PORT || 6379),
  };

  const CLEAN_GRACE_MS = 5000;

  beforeEach(async () => {
    serverAdapter = new ExpressAdapter();
    testQueue = new Queue('BullScheduledJobTest', { redis });

    await testQueue.obliterate({ force: true });

    createBullBoard({
      queues: [new BullAdapter(testQueue)],
      serverAdapter,
    });
  });

  afterEach(async () => {
    await testQueue.obliterate({ force: true });
    await testQueue.close();
  });

  const ageBeyondGrace = () => new Promise((resolve) => setTimeout(resolve, CLEAN_GRACE_MS + 200));

  const optsOf = (job: Queue.Job) => job.opts as Queue.JobOptions & { prevMillis?: number };

  const client = () => (testQueue as any).client as { hset: (...args: any[]) => Promise<unknown> };
  const toKey = (jobId: Queue.JobId) => (testQueue as any).toKey(jobId) as string;

  async function getArmedRun() {
    const delayed = await testQueue.getDelayed();
    const armed = delayed.find((job) => !!job.opts?.repeat?.key);

    if (!armed) {
      throw new Error('Repeatable job should have produced a delayed run');
    }

    return armed;
  }

  describe('Cleaning every delayed job', () => {
    it('removes ordinary and past runs but leaves the armed run and its schedule', async () => {
      await testQueue.add('scheduled-task', {}, { repeat: { every: 60_000 } });
      const ordinaryJob = await testQueue.add('ordinary-task', {}, { delay: 120_000 });

      const armedRun = await getArmedRun();
      expect(await testQueue.getRepeatableJobs()).toHaveLength(1);

      const pastRun = await testQueue.add('scheduled-task', {}, { delay: 120_000 });
      await client().hset(
        toKey(pastRun.id),
        'opts',
        JSON.stringify({
          ...optsOf(armedRun),
          jobId: pastRun.id,
          prevMillis: (optsOf(armedRun).prevMillis as number) - 60_000,
        })
      );

      await ageBeyondGrace();

      await request(serverAdapter.getRouter())
        .put(`/api/queues/${testQueue.name}/clean/delayed`)
        .expect(200);

      expect(await testQueue.getJob(ordinaryJob.id)).toBeNull();
      expect(await testQueue.getJob(pastRun.id)).toBeNull();

      const delayedAfter = await testQueue.getDelayed();
      expect(delayedAfter.map((job) => job.id)).toEqual([armedRun.id]);

      const repeatables = await testQueue.getRepeatableJobs();
      expect(repeatables).toHaveLength(1);
      expect(repeatables[0].next).toBe(optsOf(armedRun).prevMillis);
    });

    it('is unaffected on a queue that has no repeatables', async () => {
      const ordinaryJob = await testQueue.add('ordinary-task', {}, { delay: 120_000 });

      await ageBeyondGrace();

      await request(serverAdapter.getRouter())
        .put(`/api/queues/${testQueue.name}/clean/delayed`)
        .expect(200);

      expect(await testQueue.getJob(ordinaryJob.id)).toBeNull();
      expect(await testQueue.getDelayed()).toHaveLength(0);
    });

    it('still respects the grace window', async () => {
      const freshJob = await testQueue.add('ordinary-task', {}, { delay: 120_000 });
      await testQueue.add('scheduled-task', {}, { repeat: { every: 60_000 } });

      await request(serverAdapter.getRouter())
        .put(`/api/queues/${testQueue.name}/clean/delayed`)
        .expect(200);

      expect(await testQueue.getJob(freshJob.id)).not.toBeNull();
    });
  });

  describe('Cleaning a single job', () => {
    it('refuses to remove the armed run and names the schedule responsible', async () => {
      await testQueue.add('scheduled-task', {}, { repeat: { every: 60_000 } });
      const armedRun = await getArmedRun();

      const { body } = await request(serverAdapter.getRouter())
        .put(`/api/queues/${testQueue.name}/${armedRun.id}/clean`)
        .expect(400);

      expect(body).toMatchObject({
        code: 'JOB_BELONGS_TO_JOB_SCHEDULER',
        jobSchedulerId: armedRun.opts.repeat?.key,
      });
      expect(body.error).toEqual({ key: 'ERRORS.JOB_BELONGS_TO_JOB_SCHEDULER' });

      expect(await testQueue.getJob(armedRun.id)).not.toBeNull();
      expect(await testQueue.getRepeatableJobs()).toHaveLength(1);
    });

    it('removes an ordinary job while a schedule is registered', async () => {
      await testQueue.add('scheduled-task', {}, { repeat: { every: 60_000 } });
      const ordinaryJob = await testQueue.add('ordinary-task', {}, { delay: 120_000 });

      await request(serverAdapter.getRouter())
        .put(`/api/queues/${testQueue.name}/${ordinaryJob.id}/clean`)
        .expect(204);

      expect(await testQueue.getJob(ordinaryJob.id)).toBeNull();
      expect(await testQueue.getRepeatableJobs()).toHaveLength(1);
    });
  });
});
