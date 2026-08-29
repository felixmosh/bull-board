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
    await Promise.allSettled(
      queueList.map(async (queue) => {
        try {
          await queue.waitUntilReady();
        } catch {
          // ignore
        }
        return queue.close();
      })
    );
  });

  describe('before hook', () => {
    it('should block a request when before hook denies', async () => {
      const paintQueue = new Queue('Paint', { connection });
      queueList.push(paintQueue);

      const before = jest.fn().mockReturnValue({ allow: false, message: 'nope' });

      createBullBoard({
        queues: [new BullMQAdapter(paintQueue)],
        serverAdapter,
        options: { handlerHooks: { before } },
      });

      const res = await request(serverAdapter.getRouter())
        .get('/api/queues')
        .expect('Content-Type', /json/)
        .expect(403);

      expect(res.body.error).toEqual({ key: 'ERRORS.FORBIDDEN' });
      expect(res.body.message).toBe('nope');
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
        options: { handlerHooks: { before: () => ({ allow: false }) } },
      });

      const res = await request(serverAdapter.getRouter()).get('/api/queues').expect(403);

      expect(res.body.error).toEqual({ key: 'ERRORS.FORBIDDEN' });
      expect(res.body.message).toBeUndefined();
    });

    it('should respect a custom status and errorKey from the before hook', async () => {
      const paintQueue = new Queue('Paint', { connection });
      queueList.push(paintQueue);

      createBullBoard({
        queues: [new BullMQAdapter(paintQueue)],
        serverAdapter,
        options: {
          handlerHooks: {
            before: () => ({ allow: false, status: 400, errorKey: 'ERRORS.INVALID_QUEUE' }),
          },
        },
      });

      const res = await request(serverAdapter.getRouter()).get('/api/queues').expect(400);

      expect(res.body.error).toEqual({ key: 'ERRORS.INVALID_QUEUE' });
    });

    it('should return a 500 when the before hook throws', async () => {
      const paintQueue = new Queue('Paint', { connection });
      queueList.push(paintQueue);

      createBullBoard({
        queues: [new BullMQAdapter(paintQueue)],
        serverAdapter,
        options: {
          handlerHooks: {
            before: () => {
              throw new Error('boom');
            },
          },
        },
      });

      const res = await request(serverAdapter.getRouter()).get('/api/queues').expect(500);

      expect(res.body.error).toEqual({ key: 'ERRORS.INTERNAL_SERVER_ERROR' });
    });

    it('should allow the request through when before hook allows', async () => {
      const paintQueue = new Queue('Paint', { connection });
      queueList.push(paintQueue);

      createBullBoard({
        queues: [new BullMQAdapter(paintQueue)],
        serverAdapter,
        options: { handlerHooks: { before: () => ({ allow: true }) } },
      });

      const res = await request(serverAdapter.getRouter())
        .get('/api/queues')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body.queues).toHaveLength(1);
      expect(res.body.queues[0].name).toBe(paintQueue.name);
    });

    it('should allow the request through when only an after hook is provided', async () => {
      const paintQueue = new Queue('Paint', { connection });
      queueList.push(paintQueue);

      createBullBoard({
        queues: [new BullMQAdapter(paintQueue)],
        serverAdapter,
        options: { handlerHooks: { after: (_ctx, result) => result } },
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
        options: { handlerHooks: { after } },
      });

      const res = await request(serverAdapter.getRouter()).get('/api/queues').expect(200);

      expect(res.body.injected).toBe(true);
      expect(res.body.queues).toHaveLength(1);
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
        options: { handlerHooks: { before: () => ({ allow: false }), after } },
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

      const res = await request(serverAdapter.getRouter())
        .get('/api/queues')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body.queues).toHaveLength(1);
    });
  });
});
