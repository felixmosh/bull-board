import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { BaseAdapter } from '@bull-board/api/dist/queueAdapters/base';
import type { AppQueue, QueueWorker } from '@bull-board/api/typings/app';
import type { GetQueueWorkersResponse } from '@bull-board/api/typings/responses';
import { ExpressAdapter } from '@bull-board/express';
import Bull from 'bull';
import { Queue, type RedisClient, Worker, type WorkerOptions } from 'bullmq';
import request from 'supertest';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: +(process.env.REDIS_PORT || 6379),
};

async function fetchWorkers(
  serverAdapter: ExpressAdapter,
  queueName: string
): Promise<GetQueueWorkersResponse> {
  const res = await request(serverAdapter.getRouter())
    .get(`/api/queues/${encodeURIComponent(queueName)}/workers`)
    .expect(200);
  return JSON.parse(res.text);
}

/** The `hasWorkers` flag the board polls for, which is what drives the warning badge. */
async function fetchQueues(serverAdapter: ExpressAdapter): Promise<AppQueue[]> {
  const res = await request(serverAdapter.getRouter()).get('/api/queues').expect(200);
  return JSON.parse(res.text).queues;
}

/** The worker registers its blocking connection asynchronously, right after it starts. */
async function waitForWorkers(
  serverAdapter: ExpressAdapter,
  queueName: string
): Promise<QueueWorker[]> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const { workers } = await fetchWorkers(serverAdapter, queueName);
    if (workers?.length) {
      return workers;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`No workers showed up for "${queueName}"`);
}

function recordClientListCalls(redis: RedisClient): () => unknown[] {
  const sendCommand = jest.spyOn(Object.getPrototypeOf(redis), 'sendCommand') as jest.SpyInstance;
  return () =>
    sendCommand.mock.calls
      .map(([command], index) => ({ command, client: sendCommand.mock.contexts[index] }))
      .filter(
        ({ command }) =>
          command.name === 'client' && String(command.args[0]).toLowerCase() === 'list'
      )
      .map(({ client }) => client);
}

async function startQueue(name: string): Promise<Queue> {
  const queue = new Queue(name, { connection });
  await queue.waitUntilReady();
  return queue;
}

async function startWorker(
  name: string,
  opts: Omit<WorkerOptions, 'connection'> = {}
): Promise<Worker> {
  const worker = new Worker(name, async () => 'ok', { connection, ...opts });
  await worker.waitUntilReady();
  return worker;
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
      queue = await startQueue('WorkerlessBullMQ');
      createBullBoard({ queues: [new BullMQAdapter(queue)], serverAdapter });

      const { workers } = await fetchWorkers(serverAdapter, 'WorkerlessBullMQ');
      expect(workers).toEqual([]);
    });

    it('reports a connected worker with its name, address and age', async () => {
      queue = await startQueue('WatchedBullMQ');
      createBullBoard({ queues: [new BullMQAdapter(queue)], serverAdapter });

      worker = await startWorker('WatchedBullMQ', { name: 'crunch-1' });

      const workers = await waitForWorkers(serverAdapter, 'WatchedBullMQ');
      expect(workers).toHaveLength(1);
      expect(workers[0]).toEqual({
        id: expect.stringMatching(/^\d+$/),
        name: 'crunch-1',
        addr: expect.stringContaining(':'),
        age: expect.any(Number),
      });
    });

    it('leaves the name empty for an unnamed worker', async () => {
      queue = await startQueue('AnonymousBullMQ');
      createBullBoard({ queues: [new BullMQAdapter(queue)], serverAdapter });

      worker = await startWorker('AnonymousBullMQ');

      const workers = await waitForWorkers(serverAdapter, 'AnonymousBullMQ');
      expect(workers[0].name).toBeNull();
    });

    it('answers with a null list when the queue cannot be asked', async () => {
      queue = await startQueue('UnreachableBullMQ');
      const adapter = new BullMQAdapter(queue);
      jest.spyOn(adapter, 'getWorkers').mockRejectedValue(new Error('Connection is closed'));
      createBullBoard({ queues: [adapter], serverAdapter });

      const { workers } = await fetchWorkers(serverAdapter, 'UnreachableBullMQ');
      expect(workers).toBeNull();
    });

    it('resolves a queue that carries a prefix', async () => {
      queue = await startQueue('PrefixedBullMQ');
      createBullBoard({
        queues: [new BullMQAdapter(queue, { prefix: 'prefixed/' })],
        serverAdapter,
      });

      const { workers } = await fetchWorkers(serverAdapter, 'prefixed/PrefixedBullMQ');
      expect(workers).toEqual([]);
    });

    it('answers 404 for a queue the board does not know', async () => {
      queue = await startQueue('KnownBullMQ');
      createBullBoard({ queues: [new BullMQAdapter(queue)], serverAdapter });

      const res = await request(serverAdapter.getRouter())
        .get('/api/queues/NoSuchQueue/workers')
        .expect(404);

      expect(JSON.parse(res.text).error).toEqual({ key: 'ERRORS.QUEUE_NOT_FOUND' });
    });

    it('serves a read only queue, since the list changes nothing', async () => {
      queue = await startQueue('ReadOnlyBullMQ');
      createBullBoard({
        queues: [new BullMQAdapter(queue, { readOnlyMode: true })],
        serverAdapter,
      });

      const { workers } = await fetchWorkers(serverAdapter, 'ReadOnlyBullMQ');
      expect(workers).toEqual([]);
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
      expect(workers[0]).toEqual({
        id: expect.stringMatching(/^\d+$/),
        name: null,
        addr: expect.stringContaining(':'),
        age: expect.any(Number),
      });
    });
  });

  describe('hasWorkers on the queue listing', () => {
    let queue: Queue;
    let worker: Worker | undefined;

    afterEach(async () => {
      await worker?.close();
      worker = undefined;
      await queue.obliterate({ force: true }).catch(() => {});
      await queue.close();
    });

    it('is false while nothing is consuming the queue', async () => {
      queue = await startQueue('FlagWorkerless');
      createBullBoard({ queues: [new BullMQAdapter(queue)], serverAdapter });

      const [appQueue] = await fetchQueues(serverAdapter);
      expect(appQueue.hasWorkers).toBe(false);
    });

    it('turns true once a worker connects', async () => {
      queue = await startQueue('FlagWatched');
      createBullBoard({ queues: [new BullMQAdapter(queue)], serverAdapter });

      worker = await startWorker('FlagWatched');
      await waitForWorkers(serverAdapter, 'FlagWatched');

      const [appQueue] = await fetchQueues(serverAdapter);
      expect(appQueue.hasWorkers).toBe(true);
    });

    it('is null when the board opted out, so nothing is asked of redis', async () => {
      queue = await startQueue('FlagOptedOut');
      const adapter = new BullMQAdapter(queue);
      const getWorkerLookup = jest.spyOn(adapter, 'getWorkerLookup');
      const getWorkers = jest.spyOn(adapter, 'getWorkers');
      createBullBoard({
        queues: [adapter],
        serverAdapter,
        options: { uiConfig: { showWorkers: false } },
      });

      const [appQueue] = await fetchQueues(serverAdapter);
      expect(appQueue.hasWorkers).toBeNull();
      expect(getWorkerLookup).not.toHaveBeenCalled();
      expect(getWorkers).not.toHaveBeenCalled();
    });

    it('is null for a queue that cannot be reached, leaving the rest of the board alone', async () => {
      queue = await startQueue('FlagReachable');
      const broken = new BullMQAdapter(queue);
      jest.spyOn(broken, 'getName').mockReturnValue('FlagBroken');
      jest.spyOn(broken, 'getWorkerLookup').mockRejectedValue(new Error('Connection is closed'));
      createBullBoard({ queues: [broken, new BullMQAdapter(queue)], serverAdapter });

      const queues = await fetchQueues(serverAdapter);
      expect(queues.find((q) => q.name === 'FlagBroken')?.hasWorkers).toBeNull();
      expect(queues.find((q) => q.name === 'FlagReachable')?.hasWorkers).toBe(false);
    });
  });

  describe('hasWorkers across queues sharing a connection', () => {
    let owners: Queue[];
    let queues: Queue[];
    let worker: Worker | undefined;

    beforeEach(() => {
      owners = [];
      queues = [];
    });

    async function sharing(names: string[]): Promise<RedisClient> {
      const owner = await startQueue(`${names[0]}Owner`);
      const redis = await owner.client;
      owners.push(owner);
      queues.push(...names.map((name) => new Queue(name, { connection: redis })));
      return redis;
    }

    afterEach(async () => {
      jest.restoreAllMocks();
      await worker?.close();
      worker = undefined;
      await Promise.all(queues.map((queue) => queue.obliterate({ force: true }).catch(() => {})));
      await Promise.all([...queues, ...owners].map((queue) => queue.close()));
    });

    it('reads CLIENT LIST once per poll however many queues share the connection', async () => {
      const redis = await sharing(['SharedA', 'SharedB', 'SharedC', 'SharedD', 'SharedE']);
      createBullBoard({ queues: queues.map((queue) => new BullMQAdapter(queue)), serverAdapter });
      worker = await startWorker('SharedC');
      await waitForWorkers(serverAdapter, 'SharedC');
      const clientListCalls = recordClientListCalls(redis);

      const listed = await fetchQueues(serverAdapter);

      expect(clientListCalls()).toHaveLength(1);
      expect(Object.fromEntries(listed.map((q) => [q.name, q.hasWorkers]))).toEqual({
        SharedA: false,
        SharedB: false,
        SharedC: true,
        SharedD: false,
        SharedE: false,
      });
    });

    it('reads CLIENT LIST once on each connection when queues are split across two', async () => {
      const redis = await sharing(['SplitA1', 'SplitA2', 'SplitA3']);
      await sharing(['SplitB1', 'SplitB2', 'SplitB3']);
      createBullBoard({ queues: queues.map((queue) => new BullMQAdapter(queue)), serverAdapter });
      worker = await startWorker('SplitB2');
      await waitForWorkers(serverAdapter, 'SplitB2');
      const clientListCalls = recordClientListCalls(redis);

      const listed = await fetchQueues(serverAdapter);

      expect(clientListCalls()).toHaveLength(2);
      expect(new Set(clientListCalls()).size).toBe(2);
      expect(listed.filter((q) => q.hasWorkers).map((q) => q.name)).toEqual(['SplitB2']);
    });

    it('sees a worker that connected after the previous poll', async () => {
      await sharing(['SharedLate']);
      createBullBoard({ queues: [new BullMQAdapter(queues[0])], serverAdapter });
      expect((await fetchQueues(serverAdapter))[0].hasWorkers).toBe(false);

      worker = await startWorker('SharedLate');
      await waitForWorkers(serverAdapter, 'SharedLate');

      expect((await fetchQueues(serverAdapter))[0].hasWorkers).toBe(true);
    });

    it('is null when the redis provider rejects CLIENT LIST', async () => {
      const redis = await sharing(['SharedBlocked']);
      jest
        .spyOn(Object.getPrototypeOf(redis), 'client')
        .mockRejectedValue(
          new Error("ERR unknown command 'client', with args beginning with: 'LIST'")
        );
      createBullBoard({ queues: [new BullMQAdapter(queues[0])], serverAdapter });

      expect((await fetchQueues(serverAdapter))[0].hasWorkers).toBeNull();
    });

    it('answers an adapter without a lookup from getWorkers, without reading CLIENT LIST', async () => {
      const redis = await sharing(['SharedCustom']);
      const adapter = new BullMQAdapter(queues[0]);
      jest.spyOn(adapter, 'getWorkerLookup').mockResolvedValue(null);
      jest
        .spyOn(adapter, 'getWorkers')
        .mockResolvedValue([{ id: '1', addr: '10.0.0.1:5000', age: 0, name: null }]);
      createBullBoard({ queues: [adapter], serverAdapter });
      const clientListCalls = recordClientListCalls(redis);

      expect((await fetchQueues(serverAdapter))[0].hasWorkers).toBe(true);
      expect(clientListCalls()).toHaveLength(0);
    });
  });

  describe('BullAdapter hasWorkers', () => {
    let queue: Bull.Queue;

    afterEach(async () => {
      await queue.obliterate({ force: true }).catch(() => {});
      await queue.close();
    });

    it('turns true once the queue processes', async () => {
      queue = new Bull('FlagBull', { redis: connection });
      queue.on('error', () => {});
      createBullBoard({ queues: [new BullAdapter(queue)], serverAdapter });
      expect((await fetchQueues(serverAdapter))[0].hasWorkers).toBe(false);

      queue.process(async () => 'ok');
      await waitForWorkers(serverAdapter, 'FlagBull');

      expect((await fetchQueues(serverAdapter))[0].hasWorkers).toBe(true);
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

    it('reads a worker name only for a library that passes its separator', () => {
      const normalize = (BaseAdapter.prototype as any).normalizeWorkers.bind({});
      const clients = [{ id: '7', addr: '10.0.0.1:5000', age: '3', name: 'bull:q:w:crunch-1' }];

      expect(normalize(clients, ':w:')[0].name).toBe('crunch-1');
      // Bull has no notion of a named worker, so it passes nothing and every worker is unnamed.
      expect(normalize(clients)[0].name).toBeNull();
    });
  });

  describe('visibility guard', () => {
    let queue: Queue;

    afterEach(async () => {
      await queue.obliterate({ force: true }).catch(() => {});
      await queue.close();
    });

    it('hides a queue the request is not allowed to see', async () => {
      queue = await startQueue('HiddenBullMQ');
      const adapter = new BullMQAdapter(queue);
      adapter.setVisibilityGuard(() => false);
      createBullBoard({ queues: [adapter], serverAdapter });

      const res = await request(serverAdapter.getRouter())
        .get('/api/queues/HiddenBullMQ/workers')
        .expect(404);

      expect(JSON.parse(res.text).error).toEqual({ key: 'ERRORS.QUEUE_NOT_FOUND' });
      expect(await fetchQueues(serverAdapter)).toEqual([]);
    });
  });

  describe('uiConfig.showWorkers', () => {
    let queue: Queue;

    afterEach(async () => {
      await queue.obliterate({ force: true }).catch(() => {});
      await queue.close();
    });

    it('refuses the route when the board opted out', async () => {
      queue = await startQueue('OptedOutBullMQ');
      createBullBoard({
        queues: [new BullMQAdapter(queue)],
        serverAdapter,
        options: { uiConfig: { showWorkers: false } },
      });

      const res = await request(serverAdapter.getRouter())
        .get('/api/queues/OptedOutBullMQ/workers')
        .expect(403);

      expect(JSON.parse(res.text)).toEqual({ error: { key: 'ERRORS.WORKERS_DISABLED' } });
    });

    it('serves the route when the setting is left alone', async () => {
      queue = await startQueue('DefaultBullMQ');
      createBullBoard({ queues: [new BullMQAdapter(queue)], serverAdapter });

      const { workers } = await fetchWorkers(serverAdapter, 'DefaultBullMQ');
      expect(workers).toEqual([]);
    });
  });
});
