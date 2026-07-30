import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { BaseAdapter } from '@bull-board/api/dist/queueAdapters/base';
import type { GetQueueWorkersResponse } from '@bull-board/api/typings/responses';
import { ExpressAdapter } from '@bull-board/express';
import Bull from 'bull';
import { Queue, Worker } from 'bullmq';
import request from 'supertest';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: +(process.env.REDIS_PORT || 6379),
};

async function fetchWorkers(serverAdapter: ExpressAdapter): Promise<GetQueueWorkersResponse> {
  const res = await request(serverAdapter.getRouter()).get('/api/queues/workers').expect(200);
  return JSON.parse(res.text);
}

/** The worker registers its blocking connection asynchronously, right after it starts. */
async function waitForWorkers(serverAdapter: ExpressAdapter, queueName: string) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const { workers } = await fetchWorkers(serverAdapter);
    if (workers[queueName]?.length) {
      return workers[queueName];
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`No workers showed up for "${queueName}"`);
}

describe('Queue workers', () => {
  let serverAdapter: ExpressAdapter;

  beforeEach(() => {
    serverAdapter = new ExpressAdapter();
  });

  describe('BullMQAdapter', () => {
    let queue: Queue;
    let worker: Worker | undefined;

    afterEach(async () => {
      await worker?.close();
      worker = undefined;
      await queue.obliterate({ force: true }).catch(() => {});
      await queue.close();
    });

    it('reports an empty list when nothing is consuming the queue', async () => {
      queue = new Queue('WorkerlessBullMQ', { connection });
      createBullBoard({ queues: [new BullMQAdapter(queue)], serverAdapter });

      const { workers } = await fetchWorkers(serverAdapter);
      expect(workers).toEqual({ WorkerlessBullMQ: [] });
    });

    it('reports a connected worker with its name, address and age', async () => {
      queue = new Queue('WatchedBullMQ', { connection });
      createBullBoard({ queues: [new BullMQAdapter(queue)], serverAdapter });

      worker = new Worker('WatchedBullMQ', async () => 'ok', {
        connection,
        name: 'crunch-1',
      });

      const workers = await waitForWorkers(serverAdapter, 'WatchedBullMQ');
      expect(workers).toHaveLength(1);
      expect(workers?.[0]).toEqual({
        id: expect.stringMatching(/^\d+$/),
        name: 'crunch-1',
        addr: expect.stringContaining(':'),
        age: expect.any(Number),
      });
    });

    it('leaves the name empty for an unnamed worker', async () => {
      queue = new Queue('AnonymousBullMQ', { connection });
      createBullBoard({ queues: [new BullMQAdapter(queue)], serverAdapter });

      worker = new Worker('AnonymousBullMQ', async () => 'ok', { connection });

      const workers = await waitForWorkers(serverAdapter, 'AnonymousBullMQ');
      expect(workers?.[0].name).toBeNull();
    });

    it('keeps the queue prefix in the response key', async () => {
      queue = new Queue('PrefixedBullMQ', { connection });
      createBullBoard({
        queues: [new BullMQAdapter(queue, { prefix: 'prefixed/' })],
        serverAdapter,
      });

      const { workers } = await fetchWorkers(serverAdapter);
      expect(Object.keys(workers)).toEqual(['prefixed/PrefixedBullMQ']);
    });
  });

  describe('BullAdapter', () => {
    let queue: Bull.Queue;

    afterEach(async () => {
      await queue.obliterate({ force: true }).catch(() => {});
      await queue.close();
    });

    it('reports the queue own blocking connection once it processes', async () => {
      queue = new Bull('WatchedBull', { redis: connection });
      queue.on('error', () => {});
      createBullBoard({ queues: [new BullAdapter(queue)], serverAdapter });

      queue.process(async () => 'ok');

      const workers = await waitForWorkers(serverAdapter, 'WatchedBull');
      expect(workers?.[0]).toEqual({
        id: expect.stringMatching(/^\d+$/),
        name: null,
        addr: expect.stringContaining(':'),
        age: expect.any(Number),
      });
    });
  });

  describe('BaseAdapter', () => {
    it('reports null for an adapter that does not implement it', async () => {
      await expect(BaseAdapter.prototype.getWorkers.call({} as any)).resolves.toBeNull();
    });

    it('reports null when the redis provider blocks CLIENT LIST', () => {
      const normalize = (BaseAdapter.prototype as any).normalizeWorkers.bind({});

      expect(normalize(undefined)).toBeNull();
      expect(normalize([{ name: 'GCP does not support client list' }])).toBeNull();
      expect(normalize([])).toEqual([]);
    });
  });

  describe('visibility guard', () => {
    let queue: Queue;

    afterEach(async () => {
      await queue.obliterate({ force: true }).catch(() => {});
      await queue.close();
    });

    it('omits queues the request is not allowed to see', async () => {
      queue = new Queue('HiddenBullMQ', { connection });
      const adapter = new BullMQAdapter(queue);
      adapter.setVisibilityGuard(() => false);
      createBullBoard({ queues: [adapter], serverAdapter });

      const { workers } = await fetchWorkers(serverAdapter);
      expect(workers).toEqual({});
    });
  });

  describe('a queue that cannot be reached', () => {
    it('reports null instead of failing the whole response', async () => {
      const brokenAdapter = {
        getWorkers: () => Promise.reject(new Error('Connection is closed')),
        isVisible: () => true,
      } as unknown as BaseAdapter;

      const { queueWorkersHandler } = require('@bull-board/api/dist/handlers/queueWorkers');
      const response = await queueWorkersHandler({
        queues: new Map([['Broken', brokenAdapter]]),
        uiConfig: {},
      });

      expect(response.body).toEqual({ workers: { Broken: null } });
    });
  });

  describe('uiConfig.showWorkers', () => {
    let queue: Queue;

    afterEach(async () => {
      await queue.obliterate({ force: true }).catch(() => {});
      await queue.close();
    });

    it('refuses the route when the board opted out', async () => {
      queue = new Queue('OptedOutBullMQ', { connection });
      createBullBoard({
        queues: [new BullMQAdapter(queue)],
        serverAdapter,
        options: { uiConfig: { showWorkers: false } },
      });

      const res = await request(serverAdapter.getRouter()).get('/api/queues/workers').expect(403);

      expect(JSON.parse(res.text)).toEqual({ error: { key: 'ERRORS.WORKERS_DISABLED' } });
    });

    it('serves the route when the setting is left alone', async () => {
      queue = new Queue('DefaultBullMQ', { connection });
      createBullBoard({ queues: [new BullMQAdapter(queue)], serverAdapter });

      const { workers } = await fetchWorkers(serverAdapter);
      expect(workers).toEqual({ DefaultBullMQ: [] });
    });
  });
});
