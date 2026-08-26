import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import Bull from 'bull';
import { Queue } from 'bullmq';
import request from 'supertest';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: +(process.env.REDIS_PORT || 6379),
};

describe('edit a job', () => {
  let queue: Queue;
  let serverAdapter: ExpressAdapter;

  beforeEach(async () => {
    queue = new Queue('EditJobQueue', { connection });
    await queue.obliterate({ force: true }).catch(() => {});
    serverAdapter = new ExpressAdapter();
    createBullBoard({ queues: [new BullMQAdapter(queue)], serverAdapter });
  });

  afterEach(async () => {
    await queue.obliterate({ force: true }).catch(() => {});
    await queue.close();
  });

  describe('delay', () => {
    it('reschedules a delayed job to the requested time', async () => {
      const job = await queue.add('later', {}, { delay: 60 * 60 * 1000 });
      const runAt = Date.now() + 5 * 60 * 1000;

      await request(serverAdapter.getRouter())
        .patch(`/api/queues/EditJobQueue/${job.id}/delay`)
        .send({ runAt })
        .expect(200);

      const updated = await queue.getJob(job.id!);
      expect(updated!.delay).toBeGreaterThan(4 * 60 * 1000);
      expect(updated!.delay).toBeLessThanOrEqual(5 * 60 * 1000);
    });

    it('treats a time in the past as due now rather than a negative delay', async () => {
      const job = await queue.add('later', {}, { delay: 60 * 60 * 1000 });

      await request(serverAdapter.getRouter())
        .patch(`/api/queues/EditJobQueue/${job.id}/delay`)
        .send({ runAt: Date.now() - 60_000 })
        .expect(200);

      expect((await queue.getJob(job.id!))!.delay).toBe(0);
    });

    it.each([
      ['a string', 'soon'],
      ['nothing', undefined],
      ['NaN', Number.NaN],
    ])('rejects %s as a run time', async (_label, runAt) => {
      const job = await queue.add('later', {}, { delay: 60 * 60 * 1000 });

      const res = await request(serverAdapter.getRouter())
        .patch(`/api/queues/EditJobQueue/${job.id}/delay`)
        .send({ runAt })
        .expect(400);

      expect(JSON.parse(res.text).error).toEqual({ key: 'ERRORS.INVALID_RUN_AT' });
    });

    it('refuses to reschedule a job that is not delayed', async () => {
      const job = await queue.add('now', {});

      const res = await request(serverAdapter.getRouter())
        .patch(`/api/queues/EditJobQueue/${job.id}/delay`)
        .send({ runAt: Date.now() + 60_000 })
        .expect(400);

      expect(JSON.parse(res.text).error).toEqual({
        key: 'ERRORS.JOB_NOT_DELAYED',
        options: { status: 'waiting' },
      });
    });
  });

  describe('priority', () => {
    it('changes the priority of a prioritized job', async () => {
      const job = await queue.add('urgent', {}, { priority: 10 });

      await request(serverAdapter.getRouter())
        .patch(`/api/queues/EditJobQueue/${job.id}/priority`)
        .send({ priority: 3 })
        .expect(200);

      expect((await queue.getJob(job.id!))!.priority).toBe(3);
    });

    it('reports the new priority on the listing, not the one the job was added with', async () => {
      const job = await queue.add('urgent', {}, { priority: 10 });

      await request(serverAdapter.getRouter())
        .patch(`/api/queues/EditJobQueue/${job.id}/priority`)
        .send({ priority: 3 })
        .expect(200);

      const res = await request(serverAdapter.getRouter())
        .get('/api/queues')
        .query({ activeQueue: 'EditJobQueue', status: 'prioritized' })
        .expect(200);

      const [listed] = JSON.parse(res.text).queues[0].jobs;
      expect(listed.priority).toBe(3);
      expect(listed.opts.priority).toBe(10);
    });

    it.each([
      ['a fraction', 1.5],
      ['a negative', -1],
      ['past the 2^21-1 ceiling', 2 ** 21],
      ['a string', '3'],
    ])('rejects %s as a priority', async (_label, priority) => {
      const job = await queue.add('urgent', {}, { priority: 10 });

      const res = await request(serverAdapter.getRouter())
        .patch(`/api/queues/EditJobQueue/${job.id}/priority`)
        .send({ priority })
        .expect(400);

      expect(JSON.parse(res.text).error).toEqual({
        key: 'ERRORS.INVALID_PRIORITY',
        options: { max: 2 ** 21 - 1 },
      });
    });
  });

  it('answers 404 for a job that is gone', async () => {
    const res = await request(serverAdapter.getRouter())
      .patch('/api/queues/EditJobQueue/nope/priority')
      .send({ priority: 1 })
      .expect(404);

    expect(JSON.parse(res.text).error).toEqual({ key: 'ERRORS.JOB_NOT_FOUND' });
  });

  it('tells a Bull caller the edit is unsupported', async () => {
    const bullQueue = new Bull('EditJobBullQueue', { redis: connection });
    const bullServerAdapter = new ExpressAdapter();
    createBullBoard({ queues: [new BullAdapter(bullQueue)], serverAdapter: bullServerAdapter });

    const job = await bullQueue.add({}, { delay: 60 * 60 * 1000 });

    const res = await request(bullServerAdapter.getRouter())
      .patch(`/api/queues/EditJobBullQueue/${job.id}/delay`)
      .send({ runAt: Date.now() + 60_000 })
      .expect(400);

    expect(JSON.parse(res.text).error).toEqual({ key: 'ERRORS.JOB_EDIT_NOT_SUPPORTED' });

    await bullQueue.obliterate({ force: true }).catch(() => {});
    await bullQueue.close();
  });
});
