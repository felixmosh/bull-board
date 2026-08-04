import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { FlowProducer, Queue } from 'bullmq';
import request from 'supertest';
import { connection, EXPECTED_MAJOR, isV6, uniqueName } from './helpers';

/**
 * BullMQ v6 can run on PostgreSQL, where there is no Redis client to hand out. That is the only
 * real backend that exercises the null-client path and the backend-based flow producer, so it
 * is tested against an actual database rather than a stub.
 *
 * Skipped, loudly, when there is no database to talk to. A silent pass here would look exactly
 * like coverage.
 */
const POSTGRES_URL = process.env.POSTGRES_URL;
const runnable = isV6() && !!POSTGRES_URL;

if (!runnable) {
  const reason = isV6()
    ? 'POSTGRES_URL is not set'
    : `bullmq@${EXPECTED_MAJOR} has no pluggable backends`;

  describe.skip(`PostgreSQL backend (skipped: ${reason})`, () => {
    it('needs bullmq@6 and POSTGRES_URL', () => undefined);
  });
} else {
  describe(`PostgreSQL backend on bullmq@${EXPECTED_MAJOR}`, () => {
    let queue: Queue;

    beforeEach(async () => {
      // Read off the module rather than imported, because v5 has no such export.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { createPostgresBackend } = require('bullmq');

      queue = new Queue(
        uniqueName('pg'),
        { connection: POSTGRES_URL } as any,
        createPostgresBackend
      );
      await queue.waitUntilReady();
    });

    afterEach(async () => {
      await queue?.obliterate({ force: true }).catch(() => undefined);
      await queue?.close();
    });

    function setupBoard() {
      const serverAdapter = new ExpressAdapter();
      createBullBoard({ queues: [new BullMQAdapter(queue)], serverAdapter });
      return request(serverAdapter.getRouter());
    }

    it('still serves the queue itself', async () => {
      await queue.add('job', { hello: 'world' });

      const adapter = new BullMQAdapter(queue);

      expect((await adapter.getJobCounts()).waiting).toBe(1);
      expect(await adapter.getJobs(['waiting'], 0, 10)).toHaveLength(1);
    });

    it('resolves no redis client instead of throwing', async () => {
      const adapter = new BullMQAdapter(queue);

      await expect(adapter.getClient()).resolves.toBeNull();
      await expect(adapter.getRedisInfo()).resolves.toBeNull();
    });

    it('reports the datastore stats postgres can actually answer', async () => {
      const res = await setupBoard().get('/api/redis/stats').expect(200);

      expect(res.body.backend).toBe('postgres');
      // Just the number, not the "17.10 (Debian ...)" build string postgres reports.
      expect(res.body.version).toMatch(/^\d+(\.\d+)*$/);
      expect(res.body.port).toEqual(expect.any(Number));
      expect(res.body.uptime).toEqual(expect.any(Number));
      expect(res.body.clients.connected).toBeGreaterThan(0);
      expect(res.body.clients.blocked).toEqual(expect.any(Number));
    });

    it('omits the rows postgres has no honest answer for', async () => {
      const res = await setupBoard().get('/api/redis/stats').expect(200);

      // Memory and replication mode are Redis concepts. `pg_database_size` measures disk, which
      // is not the same thing, so nothing is reported rather than something misleading.
      expect(res.body.memory).toBeUndefined();
      expect(res.body.mode).toBeUndefined();
    });

    it('reports a job as not being part of a flow, same as on Redis', async () => {
      const job = await queue.add('solo', {});

      const res = await setupBoard().get(`/api/queues/${queue.name}/${job.id}/flow`).expect(200);

      expect(res.body.isFlowNode).toBe(false);
      expect(res.body.flowRoot.id).toBe(job.id);
      expect(res.body.flowRoot.children).toEqual([]);
    });

    it('resolves a flow tree spanning queues', async () => {
      // Through require: the two-arg FlowProducer constructor does not exist in v5 typings.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { FlowProducer, createPostgresBackend } = require('bullmq');

      const childQueue = new Queue(
        uniqueName('pg-child'),
        { connection: POSTGRES_URL } as any,
        createPostgresBackend
      );
      const producer = new FlowProducer({ connection: POSTGRES_URL }, createPostgresBackend);

      try {
        await childQueue.waitUntilReady();

        const tree = await producer.add({
          name: 'root',
          queueName: queue.name,
          children: [
            { name: 'leaf-a', queueName: childQueue.name, data: { idx: 1 } },
            { name: 'leaf-b', queueName: childQueue.name, data: { idx: 2 } },
          ],
        });

        const serverAdapter = new ExpressAdapter();
        createBullBoard({
          queues: [new BullMQAdapter(queue), new BullMQAdapter(childQueue)],
          serverAdapter,
        });

        const childJobId = tree.children![0].job.id;
        const res = await request(serverAdapter.getRouter())
          .get(`/api/queues/${childQueue.name}/${childJobId}/flow`)
          .expect(200);

        expect(res.body.isFlowNode).toBe(true);
        expect(res.body.flowRoot.id).toBe(tree.job.id);
        expect(res.body.flowRoot.children.map((c: any) => c.name).sort()).toEqual([
          'leaf-a',
          'leaf-b',
        ]);
      } finally {
        await producer.close();
        await childQueue.obliterate({ force: true }).catch(() => undefined);
        await childQueue.close();
      }
    });

    it('resolves redis-backed flows even when a postgres queue is registered first', async () => {
      const redisQueue = new Queue(uniqueName('redis-flow'), { connection });
      const producer = new FlowProducer({ connection });

      try {
        await redisQueue.waitUntilReady();

        const tree = await producer.add({
          name: 'root',
          queueName: redisQueue.name,
          children: [{ name: 'leaf', queueName: redisQueue.name, data: {} }],
        });

        const serverAdapter = new ExpressAdapter();
        createBullBoard({
          queues: [new BullMQAdapter(queue), new BullMQAdapter(redisQueue)],
          serverAdapter,
        });

        const res = await request(serverAdapter.getRouter())
          .get(`/api/queues/${redisQueue.name}/${tree.job.id}/flow`)
          .expect(200);

        expect(res.body.isFlowNode).toBe(true);
        expect(res.body.flowRoot.id).toBe(tree.job.id);
      } finally {
        await producer.close();
        await redisQueue.obliterate({ force: true }).catch(() => undefined);
        await redisQueue.close();
      }
    });
  });
}
