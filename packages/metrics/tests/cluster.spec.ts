import { Cluster } from 'ioredis';
import { MetricsHistoryAdmin } from '../src/HistoryAdmin';
import { HistoryStore } from '../src/HistoryStore';
import { GLOBAL_QUEUE, metricsKeys, minuteToDay, resolveNamespace } from '../src/keys';
import { LatencyStore } from '../src/LatencyStore';
import { RedisMetricsHistoryProvider } from '../src/RedisMetricsHistoryProvider';
import { clusterNodes } from './connection';

const RETENTION = { minutes: 7, hours: 90, days: 90 };
const MS_PER_MINUTE = 60000;
const QUEUES = ['alpha', 'beta', 'gamma'];
const PER_QUEUE_MINUTES = 20;

if (!clusterNodes) {
  describe.skip('Redis Cluster (skipped: REDIS_CLUSTER_NODES is not set)', () => {
    it('needs a cluster to talk to', () => undefined);
  });
} else {
  describe('Redis Cluster', () => {
    let cluster: Cluster;
    let prefix: string;
    let namespace: string;
    let minute: number;
    let day: string;

    beforeAll(async () => {
      cluster = new Cluster(clusterNodes!, { redisOptions: { protocol: 2 } });
      await cluster.ping();
    });

    afterAll(async () => {
      await cluster.quit();
    });

    beforeEach(async () => {
      prefix = `bull-board:metrics:test:${Math.random().toString(36).slice(2, 10)}`;
      namespace = resolveNamespace(prefix, true);
      minute = Math.floor(Date.now() / MS_PER_MINUTE);
      day = minuteToDay(minute);
    });

    afterEach(async () => {
      await Promise.all(
        cluster.nodes('master').map(async (node) => {
          const keys = await node.keys(`${namespace}:*`);
          if (keys.length > 0) {
            await node.unlink(...keys);
          }
        })
      );
    });

    function store(): HistoryStore {
      return new HistoryStore({
        redis: cluster,
        keys: metricsKeys(namespace),
        retention: RETENTION,
      });
    }

    async function seed(): Promise<void> {
      const history = store();
      const latency = new LatencyStore({
        redis: cluster,
        keys: metricsKeys(namespace),
        retention: RETENTION,
      });
      for (const queue of QUEUES) {
        for (let i = 0; i < PER_QUEUE_MINUTES; i++) {
          await history.upsertMinute(queue, 'completed', minute - i, i + 1);
        }
        await latency.addSamples(queue, 'runtime', Math.floor(minute / 60), [1, 2, 3]);
        await latency.recordQueueAge(queue, Math.floor(minute / 60), 4321);
      }
    }

    it('writes a queue and the cross-queue rollup in one EVAL without CROSSSLOT', async () => {
      await expect(store().upsertMinute('alpha', 'completed', minute, 5)).resolves.toBeUndefined();

      const keys = metricsKeys(namespace);
      expect(await cluster.hget(keys.day('alpha', 'completed', day), String(minute))).toBe('5');
      expect(await cluster.hget(keys.day(GLOBAL_QUEUE, 'completed', day), String(minute))).toBe(
        '5'
      );
      expect(await cluster.hget(keys.totals(GLOBAL_QUEUE, 'completed'), day)).toBe('5');
    });

    it('merges latency histograms and the queue-age gauge across slots', async () => {
      const latency = new LatencyStore({
        redis: cluster,
        keys: metricsKeys(namespace),
        retention: RETENTION,
      });
      const hour = Math.floor(minute / 60);

      await expect(
        latency.addSamples('alpha', 'runtime', hour, [1, 2, 3])
      ).resolves.toBeUndefined();
      await expect(latency.recordQueueAge('alpha', hour, 4321)).resolves.toBeUndefined();

      expect(await latency.readQueueAge(GLOBAL_QUEUE, 'day', [day])).toEqual({ [day]: 4321 });
    });

    it('puts the whole namespace in one slot, which is what keeps the EVALs legal', async () => {
      await seed();

      const holders = await Promise.all(
        cluster.nodes('master').map(async (node) => (await node.keys(`${namespace}:*`)).length)
      );

      expect(holders.filter((count) => count > 0)).toHaveLength(1);
    });

    it('reports the same footprint on every call, not one arbitrary master', async () => {
      await seed();
      const admin = new MetricsHistoryAdmin({ connection: cluster, prefix });

      const runs = [];
      for (let i = 0; i < 10; i++) {
        runs.push((await admin.stats()).keys);
      }

      const expected = (
        await Promise.all(
          cluster.nodes('master').map(async (node) => (await node.keys(`${namespace}:*`)).length)
        )
      ).reduce((sum, count) => sum + count, 0);

      expect(expected).toBeGreaterThan(0);
      expect(runs).toEqual(Array.from({ length: 10 }, () => expected));
    });

    it('purges one queue and takes it back out of the cross-queue rollup', async () => {
      await seed();
      const admin = new MetricsHistoryAdmin({ connection: cluster, prefix });
      const keys = metricsKeys(namespace);
      const before = Number(await cluster.hget(keys.totals(GLOBAL_QUEUE, 'completed'), day));
      const alpha = Number(await cluster.hget(keys.totals('alpha', 'completed'), day));

      const result = await admin.purge({ queue: 'alpha' });

      expect(result.keysDeleted).toBeGreaterThan(0);
      expect(await cluster.exists(keys.totals('alpha', 'completed'))).toBe(0);
      expect(Number(await cluster.hget(keys.totals(GLOBAL_QUEUE, 'completed'), day))).toBe(
        before - alpha
      );
    });

    it('purges everything the recorder wrote', async () => {
      await seed();
      const admin = new MetricsHistoryAdmin({ connection: cluster, prefix });

      await admin.purge();

      expect((await admin.stats()).keys).toBe(0);
    });

    it('serves the charts the board reads', async () => {
      await seed();
      const provider = new RedisMetricsHistoryProvider({
        connection: cluster,
        prefix,
        retention: RETENTION,
      });
      const perQueue = PER_QUEUE_MINUTES * ((PER_QUEUE_MINUTES + 1) / 2);

      const queue = await provider.getHistory({
        queue: 'alpha',
        metric: 'completed',
        granularity: 'day',
        from: Date.now() - MS_PER_MINUTE * PER_QUEUE_MINUTES,
        to: Date.now(),
      });
      const global = await provider.getHistory({
        metric: 'completed',
        granularity: 'day',
        from: Date.now() - MS_PER_MINUTE * PER_QUEUE_MINUTES,
        to: Date.now(),
      });
      const latency = await provider.getLatency({
        queue: 'alpha',
        metric: 'runtime',
        granularity: 'day',
        percentiles: [95],
        from: Date.now() - MS_PER_MINUTE * PER_QUEUE_MINUTES,
        to: Date.now(),
      });

      expect(queue.at(-1)?.value).toBe(perQueue);
      expect(global.at(-1)?.value).toBe(perQueue * QUEUES.length);
      expect(latency.at(-1)?.count).toBe(6);
    });

    it('keeps two prefixes on one cluster from seeing each other', async () => {
      const other = `${prefix}:second`;
      await store().upsertMinute('alpha', 'completed', minute, 5);
      await new HistoryStore({
        redis: cluster,
        keys: metricsKeys(resolveNamespace(other, true)),
        retention: RETENTION,
      }).upsertMinute('alpha', 'completed', minute, 9);

      const mine = await new MetricsHistoryAdmin({ connection: cluster, prefix }).stats();
      const theirs = await new MetricsHistoryAdmin({ connection: cluster, prefix: other }).stats();

      expect(mine.queues.map((q) => q.queue).sort()).toEqual([GLOBAL_QUEUE, 'alpha']);
      expect(await cluster.hget(metricsKeys(namespace).totals('alpha', 'completed'), day)).toBe(
        '5'
      );
      expect(
        await cluster.hget(
          metricsKeys(resolveNamespace(other, true)).totals('alpha', 'completed'),
          day
        )
      ).toBe('9');
      expect(theirs.keys).toBeGreaterThan(0);

      await new MetricsHistoryAdmin({ connection: cluster, prefix: other }).purge();
    });
  });
}
