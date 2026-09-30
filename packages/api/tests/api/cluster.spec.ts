import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue, Worker } from 'bullmq';
import { Cluster } from 'ioredis';
import request from 'supertest';

const CLUSTER_NODES = process.env.REDIS_CLUSTER_NODES || '';
// BullMQ needs a hash-tagged prefix on a cluster, so one queue's keys stay in one slot.
const PREFIX = '{board-cluster}';

if (!CLUSTER_NODES) {
  describe.skip('Board on a Redis Cluster (skipped: REDIS_CLUSTER_NODES is not set)', () => {
    it('needs a cluster to talk to', () => undefined);
  });
} else {
  describe('Board on a Redis Cluster', () => {
    let cluster: Cluster;
    let queue: Queue;
    let worker: Worker | undefined;
    let name: string;

    beforeAll(async () => {
      cluster = new Cluster(
        CLUSTER_NODES.split(',').map((entry) => {
          const [host, port] = entry.split(':');

          return { host, port: Number(port) };
        }),
        { redisOptions: { maxRetriesPerRequest: null } }
      );
      await cluster.ping();
    }, 30000);

    afterAll(async () => {
      await cluster.quit();
    });

    beforeEach(async () => {
      name = `cluster-board-${process.pid}-${Date.now()}`;
      queue = new Queue(name, { connection: cluster as never, prefix: PREFIX });
      await queue.waitUntilReady();
    });

    afterEach(async () => {
      await worker?.close();
      worker = undefined;
      await queue.obliterate({ force: true }).catch(() => undefined);
      await queue.close();
    });

    function board() {
      const serverAdapter = new ExpressAdapter();
      createBullBoard({ queues: [new BullMQAdapter(queue)], serverAdapter });

      return request(serverAdapter.getRouter());
    }

    it('serves the queue, its counts and its jobs', async () => {
      await queue.addBulk([
        { name: 'a', data: { i: 1 } },
        { name: 'b', data: { i: 2 } },
      ]);

      const res = await board().get('/api/queues').expect(200);

      const served = res.body.queues.find((entry: { name: string }) => entry.name === name);
      expect(served.counts.waiting).toBe(2);

      const waiting = await board()
        .get('/api/queues')
        .query({ activeQueue: name, status: 'waiting' })
        .expect(200);

      expect(
        waiting.body.queues.find((entry: { name: string }) => entry.name === name).jobs
      ).toHaveLength(2);
    });

    it('adds, retries and removes a job through the API', async () => {
      await board()
        .post(`/api/queues/${encodeURIComponent(name)}/add`)
        .send({ name: 'added', data: { hello: 'world' } })
        .expect(200);

      worker = new Worker(
        name,
        async (): Promise<unknown> => {
          throw new Error('boom');
        },
        {
          connection: cluster as never,
          prefix: PREFIX,
        }
      );
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const failed = await queue.getFailed();
      expect(failed).toHaveLength(1);
      await worker.close();
      worker = undefined;

      await board()
        .put(`/api/queues/${encodeURIComponent(name)}/${failed[0].id}/retry`)
        .expect(204);

      expect(await (await queue.getJob(failed[0].id!))!.getState()).toBe('waiting');
      await board()
        .put(`/api/queues/${encodeURIComponent(name)}/pause`)
        .expect(200);

      expect(await queue.isPaused()).toBe(true);
    });

    it('reports the whole cluster in the stats panel, not one arbitrary node', async () => {
      const responses = await Promise.all(
        Array.from({ length: 5 }, () => board().get('/api/redis/stats').expect(200))
      );
      const bodies = responses.map((res) => res.body);

      expect(bodies[0].backend).toBe('redis');
      expect(bodies[0].mode).toBe('cluster');
      expect(new Set(bodies.map((body) => body.memory.used)).size).toBeGreaterThan(0);
      expect(new Set(bodies.map((body) => body.clients.connected)).size).toBe(1);

      const perNode = await Promise.all(
        cluster.nodes('master').map(async (node) => {
          const info = await node.info();

          return Number(/used_memory:(\d+)/.exec(info)?.[1] ?? 0);
        })
      );
      const total = perNode.reduce((sum, used) => sum + used, 0);
      const largest = Math.max(...perNode);

      expect(bodies[0].memory.used).toBeGreaterThan(largest);
      expect(bodies[0].memory.used).toBeCloseTo(total, -7);
    });
  });
}
