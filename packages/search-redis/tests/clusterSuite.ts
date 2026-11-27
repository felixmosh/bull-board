import { Job, Queue } from 'bullmq';
import { Cluster } from 'ioredis';
import { RedisSearch } from '../src/RedisSearch';
import { RedisSearchIndex } from '../src/RedisSearchIndex';
import { queueClient, sweepOnce } from '../src/sweep';
import { clusterNodes } from './connection';
import { until } from './until';

const unlinkMatching = (cluster: Cluster, pattern: string) =>
  Promise.all(
    cluster.nodes('master').map(async (node) => {
      const keys = await node.keys(pattern);
      await Promise.all(keys.map((key) => node.unlink(key)));
    })
  );

export function clusterSuite(): void {
  if (!clusterNodes) {
    describe.skip('Redis Cluster (skipped: REDIS_CLUSTER_NODES is not set)', () => {
      it('needs a cluster to talk to', () => undefined);
    });
    return;
  }

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
        await unlinkMatching(cluster, `${prefix}:*`);
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
        await unlinkMatching(cluster, `${prefix}:*`);
      }
    });

    describe('with RedisSearch and running indexers', () => {
      const run = Math.random().toString(36).slice(2, 10);
      const prefix = `search-cluster-${run}`;
      const errors: string[] = [];
      let queueConnection: Cluster;
      let search: RedisSearch;
      let queues: Queue[];
      let providers: ReturnType<RedisSearch['add']>[];

      beforeAll(async () => {
        queueConnection = new Cluster(clusterNodes!, {
          redisOptions: { protocol: 2, maxRetriesPerRequest: null },
        });
        search = new RedisSearch({
          connection: cluster,
          prefix,
          fields: { tenant: 'data.tenant', tags: 'data.tags' },
          indexer: {
            connection: queueConnection as never,
            sweepEvery: 200,
            sweepIdleEvery: 200,
            onError: (error, context) => errors.push(`${context.queue} ${error.message}`),
          },
        });
        queues = Array.from(
          { length: 6 },
          (_, i) =>
            new Queue(`q${i}-${run}`, { connection: queueConnection as never, prefix: '{bull}' })
        );
        providers = queues.map((queue) => search.add(queue));
        await Promise.all(queues.map((queue) => queue.waitUntilReady()));
      });

      afterAll(async () => {
        await search.stop();
        for (const queue of queues) {
          await queue.obliterate({ force: true });
          await queue.close();
        }
        await unlinkMatching(cluster, `${prefix}:*`);
        await queueConnection.quit();
      });

      it('indexes, searches, diagnoses, sweeps, reindexes and backfills across slots', async () => {
        const slots = new Set(
          await Promise.all(
            queues.map(
              (queue) => cluster.cluster('KEYSLOT', search.index(queue).keys.all) as Promise<number>
            )
          )
        );
        expect(slots.size).toBeGreaterThan(1);

        for (const queue of queues.slice(0, 3))
          await queue.add('pre', { tenant: 'acme', tags: ['x'] });
        await search.start();
        const added: Job[] = [];
        for (const queue of queues) {
          for (let j = 0; j < 4; j++) {
            added.push(
              await queue.add('j', { tenant: j % 2 ? 'acme' : 'beta', tags: ['x', `t${j}`] })
            );
          }
        }
        await until(async () => {
          const counts = await Promise.all(
            providers.map(async (provider) => (await provider.diagnostics!.status()).indexedJobs)
          );
          return counts.every((count, i) => count === (i < 3 ? 5 : 4));
        });

        const first = await providers[0].search({ field: 'tenant', value: 'acme', limit: 2 });
        const second = await providers[0].search({
          field: 'tenant',
          value: 'acme',
          limit: 2,
          cursor: first.cursor,
        });
        expect(first.jobIds).toHaveLength(2);
        expect(second.jobIds).toHaveLength(1);
        expect(second.cursor).toBeUndefined();
        expect(
          (
            await providers[0].search({
              field: 'tenant',
              value: 'acme',
              limit: 10,
              status: 'waiting',
            })
          ).jobIds
        ).toHaveLength(3);

        const diagnostics = providers[5].diagnostics!;
        expect(await diagnostics.status()).toMatchObject({ health: 'ok', indexedJobs: 4 });
        expect((await diagnostics.inspect!(added[21].id!)).fields).toEqual([
          { field: 'tenant', values: ['acme'], indexed: true },
          { field: 'tags', values: ['x', 't1'], indexed: true },
        ]);
        expect(await diagnostics.checkCoverage!({ sample: 50 })).toEqual({
          checked: 4,
          missing: [],
        });

        const victim = added[2];
        await victim.remove();
        await until(async () => !(await search.index(queues[0]).known([victim.id!]))[0]);

        const ghostIndex = search.index(queues[1]);
        const ghostValue = ghostIndex.keys.value('tenant', 'acme');
        await cluster.zadd(ghostIndex.keys.all, 1, 'ghost');
        await cluster.zadd(ghostValue, 1, 'ghost');
        await cluster.sadd(ghostIndex.keys.job('ghost'), ghostValue);
        await until(async () => !(await ghostIndex.known(['ghost']))[0]);
        expect(await cluster.zscore(ghostValue, 'ghost')).toBeNull();

        const moved = added[16];
        await moved.updateData({ tenant: 'gamma', tags: ['y'] });
        await search.reindex(queues[4], [moved.id!, 'nope']);
        expect(
          (await providers[4].search({ field: 'tenant', value: 'gamma', limit: 5 })).jobIds
        ).toEqual([moved.id]);
        expect(
          (await providers[4].search({ field: 'tenant', value: 'beta', limit: 10 })).jobIds
        ).not.toContain(moved.id);

        await cluster.del(search.index(queues[3]).keys.all);
        await search.backfill();
        expect((await providers[3].diagnostics!.status()).indexedJobs).toBe(4);

        expect(errors).toEqual([]);
      });
    });
  });
}
