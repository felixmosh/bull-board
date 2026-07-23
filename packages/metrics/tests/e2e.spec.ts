import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { MetricsTime, Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { MetricsHistoryAdmin } from '../src/HistoryAdmin';
import { GLOBAL_QUEUE, NAMESPACE, minuteToDay, totalsHashKey } from '../src/keys';
import { MetricsRecorder } from '../src/MetricsRecorder';
import { RedisMetricsHistoryProvider } from '../src/RedisMetricsHistoryProvider';

// Pinned to a throwaway logical database. These specs write fixture data into the shared
// `__global__` rollup and clean up by key pattern, which on the default db would both
// pollute and delete a developer's running dev-board history.
const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: +(process.env.REDIS_PORT || 6379),
  db: +(process.env.REDIS_TEST_DB || 15),
};

/**
 * See MetricsRecorder.spec.ts: `queue.obliterate()` never touches this package's own
 * history keys (separate namespace, long TTL), so wipe them first on this suite's
 * real, non-isolated Redis to keep exact-equality assertions valid.
 */
async function resetHistory(redis: Redis, name: string) {
  const keys = await redis.keys(`${NAMESPACE}:${name}:*`);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

async function waitForCompletedCount(queue: Queue, min: number) {
  for (let i = 0; i < 100; i++) {
    const count = await queue.getCompletedCount();
    if (count >= min) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('jobs did not complete');
}

async function waitForMetrics(queue: Queue, min: number) {
  for (let i = 0; i < 100; i++) {
    const m = await queue.getMetrics('completed');
    if ((m.data?.length ?? 0) >= min) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('metrics did not populate');
}

/**
 * BullMQ only finalizes a metrics minute bucket when a completion crosses a wall-clock
 * minute boundary relative to the previous one (see collectMetrics.lua), so this rewinds
 * `prevTS` directly in Redis and adds one more job to force deterministic finalization
 * instead of depending on wall-clock timing (see MetricsRecorder.spec.ts).
 */
async function forceMetricsFlush(redis: Redis, queue: Queue) {
  await redis.hset(queue.toKey('metrics:completed'), 'prevTS', String(Date.now() - 120000));
  await queue.add('flush', {});
}

describe('metrics e2e (recorder -> provider round trip)', () => {
  let redis: Redis;
  let queue: Queue;
  let worker: Worker;

  const QUEUE_NAME = 'MetricsE2EQueue';

  beforeEach(() => {
    redis = new Redis(connection);
  });

  afterEach(async () => {
    if (worker) await worker.close();
    if (queue) {
      await queue.obliterate({ force: true }).catch(() => undefined);
      await queue.close();
    }
    await redis.quit();
  });

  it('records native metrics and serves them through the provider (daily total matches)', async () => {
    await resetHistory(redis, QUEUE_NAME);

    queue = new Queue(QUEUE_NAME, { connection });
    worker = new Worker(QUEUE_NAME, async () => 'ok', {
      connection,
      metrics: { maxDataPoints: MetricsTime.ONE_HOUR },
    });

    for (let i = 0; i < 6; i++) await queue.add('job', {});
    await waitForCompletedCount(queue, 6);
    await forceMetricsFlush(redis, queue);
    await waitForMetrics(queue, 1);

    const adapter = new BullMQAdapter(queue);

    // __global__ totals are shared across every queue on this Redis instance, so
    // snapshot the pre-existing totals for the day(s) touched and measure the rollup
    // assertion below via a before/after delta instead of assuming it starts empty.
    const nativeBefore = await adapter.getMetrics('completed');
    const days = new Set<string>();
    const prevMinuteBefore = Math.floor((nativeBefore.meta.prevTS || Date.now()) / 60000);
    for (let m = prevMinuteBefore - nativeBefore.data.length - 1; m <= prevMinuteBefore; m++) {
      days.add(minuteToDay(m));
    }
    const globalBefore: Record<string, number> = {};
    for (const day of days) {
      globalBefore[day] =
        Number(await redis.hget(totalsHashKey(GLOBAL_QUEUE, 'completed'), day)) || 0;
    }

    const recorder = new MetricsRecorder({ queues: [adapter], connection: redis });
    await recorder.snapshot();
    recorder.stop();

    const native = await adapter.getMetrics('completed');
    const finalizedSum = native.data.reduce((a, b) => a + (Number(b) || 0), 0);
    expect(finalizedSum).toBeGreaterThan(0);

    const provider = new RedisMetricsHistoryProvider({ connection: redis });
    const now = native.meta.prevTS || Date.now();
    const points = await provider.getHistory({
      queue: adapter.getName(),
      metric: 'completed',
      from: now - 3 * 86400000,
      to: now,
      granularity: 'day',
    });
    const providerSum = points.reduce((a, p) => a + p.value, 0);

    expect(providerSum).toBe(finalizedSum);
    expect(providerSum).toBeGreaterThan(0);

    // Global rollup delta over the same day(s) equals the single queue's sum, since
    // this is the only queue contributing to this run's slice of the global hash.
    let globalDelta = 0;
    for (const day of days) {
      const after = Number(await redis.hget(totalsHashKey(GLOBAL_QUEUE, 'completed'), day)) || 0;
      globalDelta += after - (globalBefore[day] ?? 0);
    }
    expect(globalDelta).toBe(finalizedSum);

    // Admin round trip on the same real data: stats sees the queue, purge removes it and
    // rewinds the global rollup to exactly what it held before this run.
    const admin = new MetricsHistoryAdmin({ connection: redis });
    const stats = await admin.stats();
    const recorded = stats.queues.find((q) => q.queue === QUEUE_NAME);

    expect(recorded).toBeDefined();
    expect(recorded!.minutes).toBeGreaterThan(0);
    expect(recorded!.bytes).toBeGreaterThan(0);
    expect(stats.bytes).toBeGreaterThanOrEqual(recorded!.bytes);

    const purged = await admin.purge({ queue: QUEUE_NAME });
    expect(purged.keysDeleted).toBeGreaterThan(0);

    const afterPurge = await provider.getHistory({
      queue: adapter.getName(),
      metric: 'completed',
      from: now - 3 * 86400000,
      to: now,
      granularity: 'day',
    });
    expect(afterPurge).toEqual([]);

    for (const day of days) {
      const after = Number(await redis.hget(totalsHashKey(GLOBAL_QUEUE, 'completed'), day)) || 0;
      expect(after).toBe(globalBefore[day] ?? 0);
    }

    // The queue's own BullMQ keys are untouched by the purge.
    expect(await queue.getCompletedCount()).toBeGreaterThan(0);
  });
});
