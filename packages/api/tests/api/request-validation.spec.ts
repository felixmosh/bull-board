import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import request from 'supertest';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: +(process.env.REDIS_PORT || 6379),
};

describe('request validation', () => {
  let queue: Queue;
  let serverAdapter: ExpressAdapter;

  beforeEach(async () => {
    queue = new Queue('ValidationQueue', { connection });
    await queue.obliterate({ force: true }).catch(() => {});
    serverAdapter = new ExpressAdapter();
    createBullBoard({ queues: [new BullMQAdapter(queue)], serverAdapter });
  });

  afterEach(async () => {
    await queue.obliterate({ force: true }).catch(() => {});
    await queue.close();
  });

  const agent = () => request(serverAdapter.getRouter());

  describe('query parameters', () => {
    it('rejects a page that is not a positive integer, naming the field', async () => {
      const { body } = await agent().get('/api/queues?page=nope').expect(400);

      expect(body.error).toEqual({
        key: 'ERRORS.INVALID_QUERY_PARAM',
        options: { field: 'page' },
      });
      expect(body.code).toBe('INVALID_REQUEST');
    });

    it('rejects a status outside the known set', async () => {
      const { body } = await agent().get('/api/queues?status=sideways').expect(400);

      expect(body.error).toEqual({
        key: 'ERRORS.INVALID_QUERY_PARAM',
        options: { field: 'status' },
      });
    });

    it('coerces a numeric page out of the string the wire carries', async () => {
      await queue.add('one', {});

      const { body } = await agent()
        .get('/api/queues?activeQueue=ValidationQueue&status=latest&page=1&jobsPerPage=1')
        .expect(200);

      expect(body.queues[0].pagination.range).toEqual({ start: 0, end: 0 });
    });

    it('reads an empty query value as an absent one', async () => {
      await agent().get('/api/queues?page=&jobsPerPage=').expect(200);
    });
  });

  describe('request bodies', () => {
    it('rejects a body field with the key that route already answered', async () => {
      const { body } = await agent()
        .put('/api/queues/ValidationQueue/concurrency')
        .send({ concurrency: -1 })
        .expect(400);

      expect(body.error).toEqual({ key: 'ERRORS.INVALID_CONCURRENCY' });
    });

    it('rejects a body that is missing a required field', async () => {
      const job = await queue.add('later', {}, { delay: 60_000 });

      const { body } = await agent()
        .patch(`/api/queues/ValidationQueue/${job.id}/delay`)
        .send({})
        .expect(400);

      expect(body.error).toEqual({ key: 'ERRORS.INVALID_RUN_AT' });
    });

    it('keeps the interpolation options a key needs', async () => {
      const job = await queue.add('prioritised', {});

      const { body } = await agent()
        .patch(`/api/queues/ValidationQueue/${job.id}/priority`)
        .send({ priority: 1.5 })
        .expect(400);

      expect(body.error).toEqual({
        key: 'ERRORS.INVALID_PRIORITY',
        options: { max: 2 ** 21 - 1 },
      });
    });

    it('rejects a scheduler edit that sets neither a pattern nor an interval', async () => {
      const { body } = await agent()
        .patch('/api/queues/ValidationQueue/job-schedulers/whatever')
        .send({ tz: 'UTC' })
        .expect(400);

      expect(body.error).toEqual({ key: 'ERRORS.INVALID_SCHEDULER_SCHEDULE' });
    });
  });

  describe('ordering against the before hook', () => {
    it('lets a hook refuse a hidden route before a schema can reveal it exists', async () => {
      const hooked = new ExpressAdapter();
      createBullBoard({
        queues: [new BullMQAdapter(queue)],
        serverAdapter: hooked,
        options: {
          uiConfig: {},
          handlerHooks: { before: () => ({ allow: false, status: 404 }) },
        },
      });

      const { body } = await request(hooked.getRouter())
        .put('/api/queues/ValidationQueue/concurrency')
        .send({ concurrency: -1 })
        .expect(404);

      expect(body.error).toEqual({ key: 'ERRORS.FORBIDDEN' });
    });
  });
});
