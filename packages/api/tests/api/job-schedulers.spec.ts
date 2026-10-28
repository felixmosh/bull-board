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

    it('names the delayed job the next run will be', async () => {
      await firstQueue.upsertJobScheduler('linkable', { pattern: '0 3 * * *' }, { name: 'task' });

      const { body } = await request(serverAdapter.getRouter())
        .get('/api/job-schedulers')
        .expect(200);

      const [scheduler] = body.schedulers;
      expect(scheduler.nextRunJobId).toBe(`repeat:linkable:${scheduler.next}`);
      expect(await firstQueue.getJob(scheduler.nextRunJobId)).toBeDefined();
      // Nothing has run yet, so there is nothing to point at behind it.
      expect(scheduler.lastRunJobId).toBeUndefined();
    });

    it('names the previous run of an interval schedule while that job is kept', async () => {
      await firstQueue.upsertJobScheduler('kept-runs', { every: 500 }, { name: 'tick' });

      let processed = 0;
      worker = new Worker(firstQueue.name, async () => void processed++, {
        connection,
        autorun: true,
      });

      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline && processed < 2) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      await worker.close();
      worker = undefined;

      const { body } = await request(serverAdapter.getRouter())
        .get('/api/job-schedulers')
        .expect(200);

      const [scheduler] = body.schedulers;
      expect(scheduler.lastRunJobId).toBe(`repeat:kept-runs:${scheduler.next - 500}`);

      const lastRun = await firstQueue.getJob(scheduler.lastRunJobId);
      expect(lastRun?.finishedOn).toEqual(expect.any(Number));
    });

    it('leaves the previous run unnamed once the queue has trimmed it away', async () => {
      await firstQueue.upsertJobScheduler(
        'trimmed-runs',
        { every: 500 },
        { name: 'tick', opts: { removeOnComplete: true } }
      );

      let processed = 0;
      worker = new Worker(firstQueue.name, async () => void processed++, {
        connection,
        autorun: true,
      });

      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline && processed < 2) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      await worker.close();
      worker = undefined;

      const { body } = await request(serverAdapter.getRouter())
        .get('/api/job-schedulers')
        .expect(200);

      const [scheduler] = body.schedulers;
      // The run happened, so it still has a time; the job behind it is gone, so no link.
      expect(scheduler.lastRun).toEqual(expect.any(Number));
      expect(scheduler.lastRunJobId).toBeUndefined();
    });

    it('leaves the previous run of a cron schedule unnamed', async () => {
      await firstQueue.upsertJobScheduler(
        'cron-runs',
        { pattern: '* * * * * *' },
        { name: 'tick' }
      );

      let processed = 0;
      worker = new Worker(firstQueue.name, async () => void processed++, {
        connection,
        autorun: true,
      });

      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline && processed < 2) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      await worker.close();
      worker = undefined;

      const { body } = await request(serverAdapter.getRouter())
        .get('/api/job-schedulers')
        .expect(200);

      const [scheduler] = body.schedulers;
      // Naming it would mean parsing the pattern backwards, which the adapter does not do.
      expect(scheduler.lastRun).toEqual(expect.any(Number));
      expect(scheduler.lastRunJobId).toBeUndefined();
      expect(scheduler.nextRunJobId).toBe(`repeat:cron-runs:${scheduler.next}`);
    });

    it('leaves the listing empty when nothing is scheduled', async () => {
      const { body } = await request(serverAdapter.getRouter())
        .get('/api/job-schedulers')
        .expect(200);

      expect(body.schedulers).toEqual([]);
    });
  });

  describe('Creating a scheduler', () => {
    it.each(['SchedulersOne', 'SchedulersTwo'])(
      'persists the job template and schedule on %s',
      async (queueName) => {
        const queue = queueName === firstQueue.name ? firstQueue : secondQueue;
        const endDate = Date.now() + 7 * 24 * 60 * 60 * 1000;

        await request(serverAdapter.getRouter())
          .post(`/api/queues/${queueName}/job-schedulers`)
          .send({
            id: 'daily-report',
            name: 'report',
            data: { scope: 'daily' },
            repeat: { pattern: ' 0 3 * * * ', tz: ' Europe/Warsaw ', limit: 5, endDate },
          })
          .expect(204);

        const [scheduler] = await queue.getJobSchedulers();
        expect(scheduler).toMatchObject({
          key: 'daily-report',
          name: 'report',
          pattern: '0 3 * * *',
          tz: 'Europe/Warsaw',
          limit: 5,
          endDate,
          template: { data: { scope: 'daily' } },
        });

        const { body } = await request(serverAdapter.getRouter())
          .get('/api/job-schedulers')
          .expect(200);
        expect(body.schedulers).toHaveLength(1);
        expect(body.schedulers[0]).toMatchObject({
          id: scheduler.key,
          queueName,
          name: 'report',
          pattern: '0 3 * * *',
          template: { data: { scope: 'daily' } },
        });
      }
    );

    it('creates an interval scheduler without requiring data', async () => {
      await request(serverAdapter.getRouter())
        .post(`/api/queues/${firstQueue.name}/job-schedulers`)
        .send({ id: 'heartbeat', name: 'heartbeat', repeat: { every: 60_000 } })
        .expect(204);

      const [scheduler] = await firstQueue.getJobSchedulers();
      expect(scheduler.key).toBe('heartbeat');
      expect(scheduler.name).toBe('heartbeat');
      expect(Number(scheduler.every)).toBe(60_000);
    });

    it('uses the supplied scheduler ID when replacing an existing schedule', async () => {
      await firstQueue.upsertJobScheduler(
        'chosen-id',
        { pattern: '0 3 * * *' },
        { name: 'report', data: { original: true } }
      );

      for (let index = 0; index < 2; index++) {
        await request(serverAdapter.getRouter())
          .post(`/api/queues/${firstQueue.name}/job-schedulers`)
          .send({
            id: 'chosen-id',
            name: 'report',
            data: { original: false },
            repeat: { pattern: '0 6 * * *' },
          })
          .expect(204);
      }

      expect(await firstQueue.getJobSchedulersCount()).toBe(1);
      expect(await firstQueue.getJobScheduler('chosen-id')).toMatchObject({
        key: 'chosen-id',
        pattern: '0 6 * * *',
        template: { data: { original: false } },
      });
    });

    it.each([
      [{ pattern: 'not a cron' }, 'ERRORS.INVALID_SCHEDULER_PATTERN'],
      [{}, 'ERRORS.INVALID_SCHEDULER_SCHEDULE'],
      [{ pattern: '0 3 * * *', every: 60_000 }, 'ERRORS.INVALID_SCHEDULER_SCHEDULE'],
      [{ every: 0 }, 'ERRORS.INVALID_SCHEDULER_INTERVAL'],
      [{ every: 60_000, limit: 1.5 }, 'ERRORS.INVALID_SCHEDULER_LIMIT'],
      [{ every: 60_000, endDate: 1 }, 'ERRORS.INVALID_SCHEDULER_END_DATE'],
    ])('rejects invalid repeat options %j', async (repeat, key) => {
      const { body } = await request(serverAdapter.getRouter())
        .post(`/api/queues/${firstQueue.name}/job-schedulers`)
        .send({ id: 'task', name: 'task', repeat })
        .expect(400);

      expect(body.error).toEqual({ key });
      expect(await firstQueue.getJobSchedulersCount()).toBe(0);
    });

    it.each([
      { name: 'task', repeat: { every: 60_000 } },
      { id: '', name: 'task', repeat: { every: 60_000 } },
      { id: 123, name: 'task', repeat: { every: 60_000 } },
      { id: 'task', repeat: { every: 60_000 } },
      { id: 'task', name: 123, repeat: { every: 60_000 } },
      { id: 'task', name: 'task' },
    ])('requires a nonempty string ID, string name and repeat options in %j', async (payload) => {
      const { body } = await request(serverAdapter.getRouter())
        .post(`/api/queues/${firstQueue.name}/job-schedulers`)
        .send(payload)
        .expect(400);

      expect(body.error.key).toBe('ERRORS.INVALID_REQUEST_BODY');
      expect(await firstQueue.getJobSchedulersCount()).toBe(0);
    });

    it('rejects creation on a read only queue', async () => {
      const readOnlyServerAdapter = new ExpressAdapter();
      createBullBoard({
        queues: [new BullMQAdapter(firstQueue, { readOnlyMode: true })],
        serverAdapter: readOnlyServerAdapter,
      });

      const { body } = await request(readOnlyServerAdapter.getRouter())
        .post(`/api/queues/${firstQueue.name}/job-schedulers`)
        .send({ id: 'task', name: 'task', repeat: { every: 60_000 } })
        .expect(405);

      expect(body.error).toEqual({ key: 'ERRORS.QUEUE_READ_ONLY' });
      expect(await firstQueue.getJobSchedulersCount()).toBe(0);
    });

    it('returns a translated error for an unknown queue', async () => {
      const { body } = await request(serverAdapter.getRouter())
        .post('/api/queues/unknown/job-schedulers')
        .send({ id: 'task', name: 'task', repeat: { every: 60_000 } })
        .expect(404);

      expect(body.error).toEqual({ key: 'ERRORS.QUEUE_NOT_FOUND' });
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

    it('writes the timezone, run limit and end date onto the schedule', async () => {
      await firstQueue.upsertJobScheduler('dated', { pattern: '0 3 * * *' }, { name: 'task' });
      const endDate = Date.now() + 7 * 24 * 60 * 60 * 1000;

      await request(serverAdapter.getRouter())
        .patch(`/api/queues/${firstQueue.name}/job-schedulers/dated`)
        .send({ pattern: '0 4 * * *', tz: 'Europe/Warsaw', limit: 5, endDate })
        .expect(204);

      const scheduler = await firstQueue.getJobScheduler('dated');
      expect(scheduler?.pattern).toBe('0 4 * * *');
      expect(scheduler?.tz).toBe('Europe/Warsaw');
      expect(scheduler?.limit).toBe(5);
      expect(scheduler?.endDate).toBe(endDate);
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

  describe('Running a scheduler now', () => {
    it('adds a waiting job from the template and leaves the schedule alone', async () => {
      await firstQueue.upsertJobScheduler(
        'nightly-billing',
        { pattern: '0 3 * * *', tz: 'Europe/Warsaw' },
        { name: 'billing', data: { scope: 'nightly' }, opts: { attempts: 3 } }
      );

      const before = await firstQueue.getJobScheduler('nightly-billing');

      const { body } = await request(serverAdapter.getRouter())
        .put(`/api/queues/${firstQueue.name}/job-schedulers/nightly-billing/run`)
        .expect(200);

      expect(body.job).toMatchObject({
        name: 'billing',
        data: { scope: 'nightly' },
      });
      expect(body.job.opts).toMatchObject({ attempts: 3 });
      expect(body.job.opts.repeat).toBeUndefined();

      const created = await firstQueue.getJob(body.job.id);
      expect(await created?.getState()).toBe('waiting');

      const after = await firstQueue.getJobScheduler('nightly-billing');
      expect(after?.pattern).toBe('0 3 * * *');
      expect(after?.next).toBe(before?.next);
      expect(after?.iterationCount).toBe(before?.iterationCount);
    });

    it('leaves the pending run of the schedule where it was', async () => {
      await firstQueue.upsertJobScheduler('heartbeat', { pattern: '0 3 * * *' }, { name: 'ping' });

      const scheduler = await firstQueue.getJobScheduler('heartbeat');
      const pendingRunId = `repeat:heartbeat:${scheduler?.next}`;

      await request(serverAdapter.getRouter())
        .put(`/api/queues/${firstQueue.name}/job-schedulers/heartbeat/run`)
        .expect(200);

      const pendingRun = await firstQueue.getJob(pendingRunId);
      expect(await pendingRun?.getState()).toBe('delayed');
    });

    it('returns 404 for a scheduler that does not exist', async () => {
      const { body } = await request(serverAdapter.getRouter())
        .put(`/api/queues/${firstQueue.name}/job-schedulers/never-existed/run`)
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
        .put(`/api/queues/${firstQueue.name}/job-schedulers/read-only/run`)
        .expect(405);

      expect(await firstQueue.getJobCountByTypes('waiting')).toBe(0);
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

    it('creates a repeatable job with the supplied name, data and cron schedule', async () => {
      const endDate = Date.now() + 7 * 24 * 60 * 60 * 1000;
      await request(bullServerAdapter.getRouter())
        .post(`/api/queues/${bullQueue.name}/job-schedulers`)
        .send({
          id: 'legacy-daily-report',
          name: 'legacy-report',
          data: { scope: 'daily' },
          repeat: { pattern: '0 3 * * *', tz: 'Europe/Warsaw', limit: 5, endDate },
        })
        .expect(204);

      const [repeatable] = await bullQueue.getRepeatableJobs();
      expect(repeatable).toMatchObject({
        name: 'legacy-report',
        id: 'legacy-daily-report',
        cron: '0 3 * * *',
        tz: 'Europe/Warsaw',
        endDate,
      });
      const [pending] = await bullQueue.getDelayed();
      expect(pending.name).toBe('legacy-report');
      expect(pending.data).toEqual({ scope: 'daily' });
      expect(pending.opts.repeat).toMatchObject({ cron: '0 3 * * *', limit: 5, endDate });
    });

    it('creates independent repeatables even when the name and interval already exist', async () => {
      await bullQueue.add('legacy-task', { original: true }, { repeat: { every: 60_000 } });
      const [original] = await bullQueue.getRepeatableJobs();

      for (let index = 0; index < 2; index++) {
        await request(bullServerAdapter.getRouter())
          .post(`/api/queues/${bullQueue.name}/job-schedulers`)
          .send({ id: `legacy-${index}`, name: 'legacy-task', repeat: { every: 60_000 } })
          .expect(204);
      }

      const repeatables = await bullQueue.getRepeatableJobs();
      expect(repeatables).toHaveLength(3);
      expect(repeatables.find(({ key }) => key === original.key)).toEqual(original);
    });

    it('rejects an invalid cron without creating a repeatable job', async () => {
      const { body } = await request(bullServerAdapter.getRouter())
        .post(`/api/queues/${bullQueue.name}/job-schedulers`)
        .send({ id: 'legacy-task', name: 'legacy-task', repeat: { pattern: 'not a cron' } })
        .expect(400);

      expect(body.error).toEqual({ key: 'ERRORS.INVALID_SCHEDULER_PATTERN' });
      expect(await bullQueue.getRepeatableJobs()).toHaveLength(0);
    });

    it('rejects creation on a read only Bull queue', async () => {
      const readOnlyServerAdapter = new ExpressAdapter();
      createBullBoard({
        queues: [new BullAdapter(bullQueue, { readOnlyMode: true })],
        serverAdapter: readOnlyServerAdapter,
      });

      const { body } = await request(readOnlyServerAdapter.getRouter())
        .post(`/api/queues/${bullQueue.name}/job-schedulers`)
        .send({ id: 'legacy-task', name: 'legacy-task', repeat: { every: 60_000 } })
        .expect(405);

      expect(body.error).toEqual({ key: 'ERRORS.QUEUE_READ_ONLY' });
      expect(await bullQueue.getRepeatableJobs()).toHaveLength(0);
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

    it('refuses to run a repeatable job on demand, since Bull keeps no template', async () => {
      await bullQueue.add('legacy-task', {}, { repeat: { cron: '0 3 * * *' } });
      const [repeatable] = await bullQueue.getRepeatableJobs();

      const { body } = await request(bullServerAdapter.getRouter())
        .put(
          `/api/queues/${bullQueue.name}/job-schedulers/${encodeURIComponent(repeatable.key)}/run`
        )
        .expect(405);

      expect(body.error).toEqual({ key: 'ERRORS.JOB_SCHEDULER_RUN_NOT_SUPPORTED' });
    });
  });
});
