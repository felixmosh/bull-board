import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import BullQueue from 'bull';
import { Queue, Worker } from 'bullmq';
import request from 'supertest';

describe('Job schedulers', () => {
  let serverAdapter: ExpressAdapter;
  let firstQueue: Queue;
  let secondQueue: Queue;
  let worker: Worker | undefined;

  const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: +(process.env.REDIS_PORT || 6379),
  };

  beforeEach(async () => {
    serverAdapter = new ExpressAdapter();
    firstQueue = new Queue('SchedulersOne', { connection });
    secondQueue = new Queue('SchedulersTwo', { connection });

    await firstQueue.obliterate({ force: true });
    await secondQueue.obliterate({ force: true });

    createBullBoard({
      queues: [new BullMQAdapter(firstQueue), new BullMQAdapter(secondQueue)],
      serverAdapter,
    });
  });

  afterEach(async () => {
    await worker?.close();
    worker = undefined;
    await firstQueue.obliterate({ force: true });
    await secondQueue.obliterate({ force: true });
    await firstQueue.close();
    await secondQueue.close();
  });

  describe('Listing', () => {
    it('returns the schedulers of every queue, each tagged with its queue', async () => {
      await firstQueue.upsertJobScheduler(
        'daily-report',
        { pattern: '0 3 * * *', tz: 'Europe/Warsaw' },
        { name: 'report', data: { scope: 'daily' }, opts: { attempts: 3 } }
      );
      await secondQueue.upsertJobScheduler(
        'heartbeat',
        { every: 60_000 },
        { name: 'ping', data: {} }
      );

      const { body } = await request(serverAdapter.getRouter())
        .get('/api/job-schedulers')
        .expect(200);

      expect(body.schedulers).toHaveLength(2);

      const daily = body.schedulers.find((s: any) => s.id === 'daily-report');
      expect(daily).toMatchObject({
        queueName: 'SchedulersOne',
        name: 'report',
        pattern: '0 3 * * *',
        tz: 'Europe/Warsaw',
        template: { data: { scope: 'daily' }, opts: { attempts: 3 } },
      });
      expect(daily.next).toEqual(expect.any(Number));

      expect(body.schedulers.find((s: any) => s.id === 'heartbeat')).toMatchObject({
        queueName: 'SchedulersTwo',
        name: 'ping',
        every: 60_000,
      });
    });

    it('narrows the listing to one queue', async () => {
      await firstQueue.upsertJobScheduler('only-mine', { every: 60_000 }, { name: 'task' });
      await secondQueue.upsertJobScheduler('somebody-elses', { every: 60_000 }, { name: 'task' });

      const { body } = await request(serverAdapter.getRouter())
        .get('/api/job-schedulers')
        .query({ queueName: 'SchedulersOne' })
        .expect(200);

      expect(body.schedulers).toHaveLength(1);
      expect(body.schedulers[0].id).toBe('only-mine');
    });

    it('reports no last run before the scheduler has fired', async () => {
      await firstQueue.upsertJobScheduler('never-ran', { pattern: '0 3 * * *' }, { name: 'task' });

      const { body } = await request(serverAdapter.getRouter())
        .get('/api/job-schedulers')
        .expect(200);

      // The pending run was created by this upsert, not by a run of the schedule.
      expect(body.schedulers[0].lastRun).toBeUndefined();
      expect(body.schedulers[0].iterationCount).toBe(1);
    });

    it('reports when the previous run started', async () => {
      await firstQueue.upsertJobScheduler('ticker', { every: 500 }, { name: 'tick' });

      const processed: number[] = [];
      worker = new Worker(
        firstQueue.name,
        async (job) => {
          processed.push(job.processedOn as number);
        },
        { connection, autorun: true }
      );

      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline && processed.length < 2) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(processed.length).toBeGreaterThanOrEqual(2);

      await worker.close();
      worker = undefined;

      const { body } = await request(serverAdapter.getRouter())
        .get('/api/job-schedulers')
        .expect(200);

      const lastRun = body.schedulers[0].lastRun;
      const lastProcessed = processed[processed.length - 1];

      // Derived from the pending run's creation, which happens as the previous run starts.
      expect(Math.abs(lastRun - lastProcessed)).toBeLessThan(1_000);
    });

    it('leaves the listing empty when nothing is scheduled', async () => {
      const { body } = await request(serverAdapter.getRouter())
        .get('/api/job-schedulers')
        .expect(200);

      expect(body.schedulers).toEqual([]);
    });
  });

  describe('Counting', () => {
    it('counts schedulers per queue and in total', async () => {
      await firstQueue.upsertJobScheduler('one', { every: 60_000 }, { name: 'task' });
      await firstQueue.upsertJobScheduler('two', { every: 60_000 }, { name: 'task' });
      await secondQueue.upsertJobScheduler('three', { every: 60_000 }, { name: 'task' });

      const { body } = await request(serverAdapter.getRouter())
        .get('/api/job-schedulers/count')
        .expect(200);

      expect(body).toEqual({
        total: 3,
        byQueue: { SchedulersOne: 2, SchedulersTwo: 1 },
      });
    });

    it('leaves queues without schedulers out of the breakdown', async () => {
      await firstQueue.upsertJobScheduler('lonely', { every: 60_000 }, { name: 'task' });

      const { body } = await request(serverAdapter.getRouter())
        .get('/api/job-schedulers/count')
        .expect(200);

      expect(body).toEqual({ total: 1, byQueue: { SchedulersOne: 1 } });
    });

    it('reports zero for a board without schedulers', async () => {
      const { body } = await request(serverAdapter.getRouter())
        .get('/api/job-schedulers/count')
        .expect(200);

      expect(body).toEqual({ total: 0, byQueue: {} });
    });
  });

  describe('Updating a schedule', () => {
    it('rewrites the pattern and keeps the job template', async () => {
      await firstQueue.upsertJobScheduler(
        'nightly',
        { pattern: '0 3 * * *' },
        { name: 'report', data: { scope: 'daily' }, opts: { attempts: 3 } }
      );

      await request(serverAdapter.getRouter())
        .patch(`/api/queues/${firstQueue.name}/job-schedulers/nightly`)
        .send({ pattern: '0 5 * * *' })
        .expect(204);

      const scheduler = await firstQueue.getJobScheduler('nightly');
      expect(scheduler?.pattern).toBe('0 5 * * *');
      expect(scheduler?.name).toBe('report');
      expect(scheduler?.template?.data).toEqual({ scope: 'daily' });
      expect(scheduler?.template?.opts).toMatchObject({ attempts: 3 });
    });

    it('swaps an interval for a pattern', async () => {
      await firstQueue.upsertJobScheduler('switcher', { every: 60_000 }, { name: 'task' });

      await request(serverAdapter.getRouter())
        .patch(`/api/queues/${firstQueue.name}/job-schedulers/switcher`)
        .send({ pattern: '*/5 * * * *' })
        .expect(204);

      const scheduler = await firstQueue.getJobScheduler('switcher');
      expect(scheduler?.pattern).toBe('*/5 * * * *');
      expect(scheduler?.every).toBeUndefined();
    });

    it('rejects a pattern the queue library cannot parse, leaving the schedule intact', async () => {
      await firstQueue.upsertJobScheduler('keep-me', { pattern: '0 3 * * *' }, { name: 'task' });

      const { body } = await request(serverAdapter.getRouter())
        .patch(`/api/queues/${firstQueue.name}/job-schedulers/keep-me`)
        .send({ pattern: 'not a cron' })
        .expect(400);

      expect(body.error).toEqual({ key: 'ERRORS.INVALID_SCHEDULER_PATTERN' });
      expect((await firstQueue.getJobScheduler('keep-me'))?.pattern).toBe('0 3 * * *');
    });

    it('rejects a body that sets both a pattern and an interval', async () => {
      await firstQueue.upsertJobScheduler('both', { pattern: '0 3 * * *' }, { name: 'task' });

      const { body } = await request(serverAdapter.getRouter())
        .patch(`/api/queues/${firstQueue.name}/job-schedulers/both`)
        .send({ pattern: '0 3 * * *', every: 60_000 })
        .expect(400);

      expect(body.error).toEqual({ key: 'ERRORS.INVALID_SCHEDULER_SCHEDULE' });
    });

    it('rejects a body that sets neither', async () => {
      await firstQueue.upsertJobScheduler('neither', { pattern: '0 3 * * *' }, { name: 'task' });

      const { body } = await request(serverAdapter.getRouter())
        .patch(`/api/queues/${firstQueue.name}/job-schedulers/neither`)
        .send({ tz: 'UTC' })
        .expect(400);

      expect(body.error).toEqual({ key: 'ERRORS.INVALID_SCHEDULER_SCHEDULE' });
    });

    it('rejects a non-positive interval', async () => {
      await firstQueue.upsertJobScheduler('interval', { every: 60_000 }, { name: 'task' });

      const { body } = await request(serverAdapter.getRouter())
        .patch(`/api/queues/${firstQueue.name}/job-schedulers/interval`)
        .send({ every: 0 })
        .expect(400);

      expect(body.error).toEqual({ key: 'ERRORS.INVALID_SCHEDULER_INTERVAL' });
    });

    it('rejects an end date that has already passed', async () => {
      await firstQueue.upsertJobScheduler('ending', { every: 60_000 }, { name: 'task' });

      const { body } = await request(serverAdapter.getRouter())
        .patch(`/api/queues/${firstQueue.name}/job-schedulers/ending`)
        .send({ every: 60_000, endDate: Date.now() - 1_000 })
        .expect(400);

      expect(body.error).toEqual({ key: 'ERRORS.INVALID_SCHEDULER_END_DATE' });
    });

    it('rejects a fractional run limit', async () => {
      await firstQueue.upsertJobScheduler('limited', { every: 60_000 }, { name: 'task' });

      const { body } = await request(serverAdapter.getRouter())
        .patch(`/api/queues/${firstQueue.name}/job-schedulers/limited`)
        .send({ every: 60_000, limit: 1.5 })
        .expect(400);

      expect(body.error).toEqual({ key: 'ERRORS.INVALID_SCHEDULER_LIMIT' });
    });

    it('returns 404 for a scheduler that does not exist', async () => {
      const { body } = await request(serverAdapter.getRouter())
        .patch(`/api/queues/${firstQueue.name}/job-schedulers/never-existed`)
        .send({ pattern: '0 3 * * *' })
        .expect(404);

      expect(body.error).toEqual({ key: 'ERRORS.JOB_SCHEDULER_NOT_FOUND' });
    });

    it('is rejected on a read only queue', async () => {
      const readOnlyServerAdapter = new ExpressAdapter();
      createBullBoard({
        queues: [new BullMQAdapter(firstQueue, { readOnlyMode: true })],
        serverAdapter: readOnlyServerAdapter,
      });

      await firstQueue.upsertJobScheduler('read-only', { pattern: '0 3 * * *' }, { name: 'task' });

      await request(readOnlyServerAdapter.getRouter())
        .patch(`/api/queues/${firstQueue.name}/job-schedulers/read-only`)
        .send({ pattern: '0 5 * * *' })
        .expect(405);

      expect((await firstQueue.getJobScheduler('read-only'))?.pattern).toBe('0 3 * * *');
    });
  });

  describe('Legacy Bull queues', () => {
    let bullQueue: BullQueue.Queue;
    let bullServerAdapter: ExpressAdapter;

    beforeEach(async () => {
      bullQueue = new BullQueue('SchedulersLegacy', { redis: connection });
      await bullQueue.obliterate({ force: true });

      bullServerAdapter = new ExpressAdapter();
      createBullBoard({
        queues: [new BullAdapter(bullQueue)],
        serverAdapter: bullServerAdapter,
      });
    });

    afterEach(async () => {
      await bullQueue.obliterate({ force: true });
      await bullQueue.close();
    });

    it('lists repeatable jobs, without the fields Bull does not keep', async () => {
      await bullQueue.add('legacy-task', {}, { repeat: { cron: '0 3 * * *' } });

      const { body } = await request(bullServerAdapter.getRouter())
        .get('/api/job-schedulers')
        .expect(200);

      expect(body.schedulers).toHaveLength(1);
      expect(body.schedulers[0]).toMatchObject({
        queueName: 'SchedulersLegacy',
        name: 'legacy-task',
        pattern: '0 3 * * *',
      });
      expect(body.schedulers[0].lastRun).toBeUndefined();
      expect(body.schedulers[0].template).toBeUndefined();
    });

    it('counts repeatable jobs', async () => {
      await bullQueue.add('legacy-task', {}, { repeat: { cron: '0 3 * * *' } });

      const { body } = await request(bullServerAdapter.getRouter())
        .get('/api/job-schedulers/count')
        .expect(200);

      expect(body).toEqual({ total: 1, byQueue: { SchedulersLegacy: 1 } });
    });

    it('removes a repeatable job by key', async () => {
      await bullQueue.add('legacy-task', {}, { repeat: { cron: '0 3 * * *' } });
      const [repeatable] = await bullQueue.getRepeatableJobs();

      await request(bullServerAdapter.getRouter())
        .put(
          `/api/queues/${bullQueue.name}/job-schedulers/${encodeURIComponent(
            repeatable.key
          )}/remove`
        )
        .expect(204);

      expect(await bullQueue.getRepeatableJobs()).toHaveLength(0);
    });

    it('refuses to edit a schedule, since Bull has no upsert', async () => {
      await bullQueue.add('legacy-task', {}, { repeat: { cron: '0 3 * * *' } });
      const [repeatable] = await bullQueue.getRepeatableJobs();

      const { body } = await request(bullServerAdapter.getRouter())
        .patch(`/api/queues/${bullQueue.name}/job-schedulers/${encodeURIComponent(repeatable.key)}`)
        .send({ pattern: '0 5 * * *' })
        .expect(405);

      expect(body.error).toEqual({ key: 'ERRORS.JOB_SCHEDULER_EDIT_NOT_SUPPORTED' });
      expect(await bullQueue.getRepeatableJobs()).toHaveLength(1);
    });
  });
});
