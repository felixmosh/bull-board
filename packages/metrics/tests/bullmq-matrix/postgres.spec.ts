import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { HistoryStore } from '../../src/HistoryStore';
import { minuteToDay, NAMESPACE } from '../../src/keys';
import { LatencySampler } from '../../src/LatencySampler';
import { LatencyStore } from '../../src/LatencyStore';
import { MetricsRecorder } from '../../src/MetricsRecorder';
import { assertResolvedMajor, connection, resetHistory, uniqueName, waitFor } from './helpers';

const POSTGRES_URL = process.env.POSTGRES_URL;
const RETENTION = { minutes: 7, hours: 90, days: 90 };

if (!POSTGRES_URL) {
  describe.skip('PostgreSQL-backed queues (skipped: POSTGRES_URL is not set)', () => {
    it('needs a database to talk to', () => undefined);
  });
} else {
  describe('PostgreSQL-backed queues', () => {
    assertResolvedMajor();

    let redis: Redis;
    let queue: Queue;
    let worker: Worker | undefined;
    let adapter: BullMQAdapter;
    let name: string;

    beforeAll(() => {
      redis = new Redis(connection);
    });

    afterAll(async () => {
      await redis.quit();
    });

    beforeEach(async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { createPostgresBackend } = require('bullmq');
      queue = new Queue(
        uniqueName('pg'),
        { connection: POSTGRES_URL } as any,
        createPostgresBackend
      );
      await queue.waitUntilReady();
      adapter = new BullMQAdapter(queue);
      name = adapter.getName();
      await resetHistory(redis, name);
    });

    afterEach(async () => {
      await worker?.close();
      worker = undefined;
      completed = 0;
      await queue?.obliterate({ force: true }).catch(() => undefined);
      await queue?.close();
      await resetHistory(redis, name);
    });

    function pool(): { query(sql: string): Promise<{ rows: Record<string, any>[] }> } {
      return (queue as any).getBackend().connection.pool;
    }

    /** The PostgreSQL twin of rewinding `prevTS` in Redis: forces the next finished job to
     *  cross a minute boundary so a finalized data point appears without a real 60s wait. */
    async function forceMetricsFlush(): Promise<void> {
      await pool().query(
        `UPDATE metrics SET prev_ts = ${Date.now() - 120000}
          WHERE queue = '${queue.name}' AND kind = 'completed'`
      );
    }

    let completed = 0;

    async function runJobs(count: number): Promise<void> {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { createPostgresBackend, MetricsTime } = require('bullmq');
      await queue.addBulk(Array.from({ length: count }, (_, i) => ({ name: 'job', data: { i } })));
      completed += count;
      worker =
        worker ??
        new Worker(
          queue.name,
          async () => 'ok',
          {
            connection: POSTGRES_URL,
            metrics: { maxDataPoints: MetricsTime.ONE_HOUR },
          } as any,
          createPostgresBackend
        );
      const target = completed;
      await waitFor(
        async () => (await queue.getCompletedCount()) >= target,
        'jobs did not complete on the PostgreSQL backend'
      );
    }

    it('records nothing while the PostgreSQL backend reports no buffer anchor', async () => {
      await runJobs(3);
      await forceMetricsFlush();
      await runJobs(1);

      const metrics = await adapter.getMetrics('completed');
      expect(metrics.data.length).toBeGreaterThan(0);
      expect(metrics.meta.prevTS).toBe(0);

      const recorder = new MetricsRecorder({
        queues: [adapter],
        connection: redis,
        latency: false,
      });
      await recorder.snapshot();
      recorder.stop();

      const store = new HistoryStore({ redis, retention: RETENTION });
      const today = minuteToDay(Date.now() / 60000);
      expect(await store.readDailyTotalsRaw(name, 'completed', [today])).toEqual([null]);
    });

    it('samples no latency at all rather than a zero backlog', async () => {
      await queue.addBulk(Array.from({ length: 3 }, (_, i) => ({ name: 'job', data: { i } })));
      expect((await adapter.getJobCounts()).waiting).toBe(3);
      expect(LatencySampler.supports(adapter)).toBe(true);

      const sampler = new LatencySampler({
        redis,
        store: new LatencyStore({ redis, retention: RETENTION }),
        tickMs: 60000,
        safetyMarginMs: 0,
      });
      await sampler.sample(adapter);

      expect(await redis.keys(`${NAMESPACE}:${name}*`)).toEqual([]);
    });
  });
}
