import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import request from 'supertest';

describe('hooks', () => {
  let serverAdapter: ExpressAdapter;
  const queueList: Queue[] = [];
  const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: +(process.env.REDIS_PORT || 6379),
  };

  beforeEach(() => {
    serverAdapter = new ExpressAdapter();
    queueList.length = 0;
  });

  afterEach(async () => {
    for (const queue of queueList) {
      await queue.close();
    }
  });

  describe('before hook', () => {
    it('should block a request when before hook denies', async () => {
      const paintQueue = new Queue('Paint', { connection });
      queueList.push(paintQueue);

      const before = jest.fn().mockReturnValue({ allow: false, message: 'nope' });

      createBullBoard({
        queues: [new BullMQAdapter(paintQueue)],
        serverAdapter,
        options: { hooks: { before } },
      });

      await request(serverAdapter.getRouter())
        .get('/api/queues')
        .expect('Content-Type', /json/)
        .expect(403)
        .then((res) => {
          const body = JSON.parse(res.text);
          expect(body.error).toEqual({ key: 'ERRORS.FORBIDDEN' });
          expect(body.message).toBe('nope');
        });

      expect(before).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'get', route: '/api/queues' })
      );
    });

    it('should use a default 403 status and no message when none is provided', async () => {
      const paintQueue = new Queue('Paint', { connection });
      queueList.push(paintQueue);

      createBullBoard({
        queues: [new BullMQAdapter(paintQueue)],
        serverAdapter,
        options: { hooks: { before: () => ({ allow: false }) } },
      });

      await request(serverAdapter.getRouter())
        .get('/api/queues')
        .expect(403)
        .then((res) => {
          const body = JSON.parse(res.text);
          expect(body.error).toEqual({ key: 'ERRORS.FORBIDDEN' });
          expect(body.message).toBeUndefined();
        });
    });

    it('should respect a custom status from the before hook', async () => {
      const paintQueue = new Queue('Paint', { connection });
      queueList.push(paintQueue);

      createBullBoard({
        queues: [new BullMQAdapter(paintQueue)],
        serverAdapter,
        options: { hooks: { before: () => ({ allow: false, status: 400 }) } },
      });

      await request(serverAdapter.getRouter()).get('/api/queues').expect(400);
    });

    it('should allow the request through when before hook allows', async () => {
      const paintQueue = new Queue('Paint', { connection });
      queueList.push(paintQueue);

      createBullBoard({
        queues: [new BullMQAdapter(paintQueue)],
        serverAdapter,
        options: { hooks: { before: () => ({ allow: true }) } },
      });

      await request(serverAdapter.getRouter())
        .get('/api/queues')
        .expect('Content-Type', /json/)
        .expect(200)
        .then((res) => {
          const queues = JSON.parse(res.text).queues;
          expect(queues).toHaveLength(1);
          expect(queues[0].name).toBe(paintQueue.name);
        });
    });

    it('should allow the request through when only an after hook is provided', async () => {
      const paintQueue = new Queue('Paint', { connection });
      queueList.push(paintQueue);

      createBullBoard({
        queues: [new BullMQAdapter(paintQueue)],
        serverAdapter,
        options: { hooks: { after: (_ctx, result) => result } },
      });

      await request(serverAdapter.getRouter()).get('/api/queues').expect(200);
    });
  });

  describe('after hook', () => {
    it('should be called with the handler result and can modify it', async () => {
      const paintQueue = new Queue('Paint', { connection });
      queueList.push(paintQueue);

      const after = jest.fn().mockImplementation((_ctx, result) => ({
        ...result,
        body: { ...result.body, injected: true },
      }));

      createBullBoard({
        queues: [new BullMQAdapter(paintQueue)],
        serverAdapter,
        options: { hooks: { after } },
      });

      await request(serverAdapter.getRouter())
        .get('/api/queues')
        .expect(200)
        .then((res) => {
          const body = JSON.parse(res.text);
          expect(body.injected).toBe(true);
          expect(body.queues).toHaveLength(1);
        });

      expect(after).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'get', route: '/api/queues' }),
        expect.objectContaining({ body: expect.objectContaining({ queues: expect.any(Array) }) })
      );
    });

    it('should not run the after hook when before hook denies', async () => {
      const paintQueue = new Queue('Paint', { connection });
      queueList.push(paintQueue);

      const after = jest.fn().mockImplementation((_ctx, result) => result);

      createBullBoard({
        queues: [new BullMQAdapter(paintQueue)],
        serverAdapter,
        options: { hooks: { before: () => ({ allow: false }), after } },
      });

      await request(serverAdapter.getRouter()).get('/api/queues').expect(403);

      expect(after).not.toHaveBeenCalled();
    });
  });

  describe('backward compatibility', () => {
    it('should behave normally when no hooks are provided', async () => {
      const paintQueue = new Queue('Paint', { connection });
      queueList.push(paintQueue);

      createBullBoard({ queues: [new BullMQAdapter(paintQueue)], serverAdapter });

      await request(serverAdapter.getRouter())
        .get('/api/queues')
        .expect('Content-Type', /json/)
        .expect(200)
        .then((res) => {
          const queues = JSON.parse(res.text).queues;
          expect(queues).toHaveLength(1);
        });
    });
  });
});
