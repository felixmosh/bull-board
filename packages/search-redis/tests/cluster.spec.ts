import { Queue } from 'bullmq';
import { Cluster } from 'ioredis';
import { RedisSearchIndex } from '../src/RedisSearchIndex';
import { queueClient, sweepOnce } from '../src/sweep';
import { clusterNodes } from './connection';

if (!clusterNodes) {
  describe.skip('Redis Cluster (skipped: REDIS_CLUSTER_NODES is not set)', () => {
    it('needs a cluster to talk to', () => undefined);
  });
} else {
  describe('Redis Cluster', () => {
    let cluster: Cluster;

    beforeAll(async () => {
      cluster = new Cluster(clusterNodes!, { redisOptions: { protocol: 2 } });
      await cluster.ping();
    });

    afterAll(async () => {
      await cluster.quit();
    });

    it('indexes, pages and removes on a cluster with the {bull} prefix', async () => {
      const queue = new Queue(`search-cluster-${Math.random().toString(36).slice(2, 10)}`, {
        connection: cluster as never,
        prefix: '{bull}',
      });
      await queue.waitUntilReady();
      const prefix = `{bull}:search-test-${Math.random().toString(36).slice(2, 10)}`;
      const index = new RedisSearchIndex({
        connection: cluster,
        queue,
        fields: { tenant: 'data.tenant', tags: 'data.tags' },
        prefix,
      });

      try {
        const jobs = await Promise.all(
          [1, 2, 3, 4, 5].map((i) =>
            queue.add('j', { tenant: 'acme', tags: ['a', 'b'] }, { timestamp: 1000 + i })
          )
        );
        await index.indexJobs(jobs);

        const first = await index.page('tenant', 'acme', undefined, 3);
        expect(first.jobIds).toHaveLength(3);
        const second = await index.page('tenant', 'acme', first.cursor, 3);
        expect(second.jobIds).toHaveLength(2);
        expect(second.cursor).toBeUndefined();
        expect(await index.known([jobs[0].id!, 'nope'])).toEqual([true, false]);

        await jobs[0].remove();
        expect(await sweepOnce(index, await queueClient(queue), 3)).toMatchObject({
          checked: 3,
          removed: 1,
        });
        expect(await sweepOnce(index, await queueClient(queue), 3)).toMatchObject({
          checked: 2,
          removed: 0,
        });

        await index.removeJobs(jobs.map((job) => job.id!));
        expect((await index.page('tenant', 'acme', undefined, 10)).jobIds).toEqual([]);
        expect(await index.known([jobs[0].id!])).toEqual([false]);
      } finally {
        await queue.obliterate({ force: true });
        await queue.close();
        await Promise.all(
          cluster.nodes('master').map(async (node) => {
            const keys = await node.keys(`${prefix}:*`);
            if (keys.length > 0) await node.unlink(...keys);
          })
        );
      }
    });

    it('sweeps the ids of a queue whose job keys span several slots', async () => {
      const name = `search-cluster-${Math.random().toString(36).slice(2, 10)}`;
      const braced = new Queue(name, { connection: cluster as never, prefix: '{bull}' });
      const unbraced = new Queue(name, { connection: cluster as never, prefix: 'bull' });
      const prefix = `{bull}:search-test-${Math.random().toString(36).slice(2, 10)}`;
      const index = new RedisSearchIndex({
        connection: cluster,
        queue: unbraced,
        fields: { tenant: 'data.tenant' },
        prefix,
      });

      try {
        const jobs = await braced.addBulk(
          Array.from({ length: 20 }, () => ({ name: 'j', data: { tenant: 'acme' } }))
        );
        await index.indexJobs(jobs);
        const slots = new Set(
          await Promise.all(
            jobs.map(
              (job) => cluster.cluster('KEYSLOT', unbraced.toKey(job.id!)) as Promise<number>
            )
          )
        );
        expect(slots.size).toBeGreaterThan(1);

        expect(await sweepOnce(index, await queueClient(unbraced), 50)).toMatchObject({
          checked: 20,
          removed: 20,
        });
        expect(await index.known(jobs.map((job) => job.id!))).toEqual(jobs.map(() => false));
      } finally {
        await braced.obliterate({ force: true });
        await braced.close();
        await unbraced.close();
        await Promise.all(
          cluster.nodes('master').map(async (node) => {
            const keys = await node.keys(`${prefix}:*`);
            if (keys.length > 0) await node.unlink(...keys);
          })
        );
      }
    });
  });
}
