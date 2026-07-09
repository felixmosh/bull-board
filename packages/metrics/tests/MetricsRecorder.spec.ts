import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import type { MetricsType } from '@bull-board/api/typings/app';
import { MetricsTime, Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { GLOBAL_QUEUE, NAMESPACE, dayHashKey, minuteToDay, totalsHashKey } from '../src/keys';
import { MetricsRecorder } from '../src/MetricsRecorder';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: +(process.env.REDIS_PORT || 6379),
};

/**
 * `queue.obliterate()` (afterEach) only clears BullMQ's own keyspace, never this
 * package's history keys (separate namespace, long TTL). Against the real,
 * non-isolated Redis this suite runs on, repeated same-day runs would otherwise
 * accumulate stale totals on top of fresh native metrics, breaking exact-equality
 * assertions -- so wipe a queue's history keys before each test that relies on one.
 */
async function resetHistory(redis: Redis, name: string) {
  const keys = await redis.keys(`${NAMESPACE}:${name}:*`);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

async function waitForMetrics(queue: Queue, min: number, metric: MetricsType = 'completed') {
  for (let i = 0; i < 100; i++) {
    const m = await queue.getMetrics(metric);
    if ((m.data?.length ?? 0) >= min) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`${metric} metrics did not populate`);
}

async function waitForCompletedCount(queue: Queue, min: number) {
  for (let i = 0; i < 100; i++) {
    const count = await queue.getCompletedCount();
    if (count >= min) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('jobs did not complete');
}

async function waitForFailedCount(queue: Queue, min: number) {
  for (let i = 0; i < 100; i++) {
    const count = await queue.getFailedCount();
    if (count >= min) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('jobs did not fail');
}

/**
 * BullMQ only appends a finalized minute bucket to `getMetrics().data` when a job
 * completes in a LATER wall-clock minute than the previous completion (see bullmq's
 * collectMetrics.lua) -- a burst completing within the same real minute never flushes,
 * so naively waiting would need a real minute boundary (up to 60s, past this suite's
 * timeout). Rewind the queue's internal `prevTS` cursor directly in Redis so the next
 * completion is treated as crossing a minute boundary, forcing deterministic
 * finalization instead of depending on wall-clock timing.
 *
 * `metric` selects which meta hash to rewind. The flush job's `shouldFail` makes it
 * fail instead of complete when needed, so it finalizes the `failed` bucket instead
 * of `completed`.
 */
async function forceMetricsFlush(redis: Redis, queue: Queue, metric: MetricsType = 'completed') {
  await redis.hset(queue.toKey(`metrics:${metric}`), 'prevTS', String(Date.now() - 120000));
  await queue.add('flush', { shouldFail: metric === 'failed' });
}

describe('MetricsRecorder', () => {
  let redis: Redis;
  let queue: Queue;
  let worker: Worker;

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

  it('snapshots finalized native metrics into the history store', async () => {
    await resetHistory(redis, 'RecorderQueue');
    queue = new Queue('RecorderQueue', { connection });
    worker = new Worker('RecorderQueue', async () => 'ok', {
      connection,
      metrics: { maxDataPoints: MetricsTime.ONE_HOUR },
    });

    for (let i = 0; i < 5; i++) await queue.add('job', {});
    await waitForCompletedCount(queue, 5);
    await forceMetricsFlush(redis, queue);
    await waitForMetrics(queue, 1);

    const adapter = new BullMQAdapter(queue);
    const recorder = new MetricsRecorder({ queues: [adapter], connection: redis });

    await recorder.snapshot();
    recorder.stop();

    const nativeCompleted = await adapter.getMetrics('completed');
    const nativeFinalizedSum = nativeCompleted.data.reduce((a, b) => a + (Number(b) || 0), 0);

    const name = adapter.getName();
    const days = new Set<string>();
    const prevMinute = Math.floor((nativeCompleted.meta.prevTS || Date.now()) / 60000);
    for (let m = prevMinute - nativeCompleted.data.length - 1; m <= prevMinute; m++) {
      days.add(minuteToDay(m));
    }
    let storedSum = 0;
    for (const day of days) {
      const v = await redis.hget(totalsHashKey(name, 'completed'), day);
      storedSum += Number(v) || 0;
      // global mirrors the single-queue total here
      const g = await redis.hget(totalsHashKey(GLOBAL_QUEUE, 'completed'), day);
      expect(Number(g) || 0).toBeGreaterThanOrEqual(Number(v) || 0);
    }

    expect(storedSum).toBe(nativeFinalizedSum);
    expect(storedSum).toBeGreaterThan(0);

    const anyDay = [...days][0];
    const dayHash = await redis.hgetall(dayHashKey(name, 'completed', anyDay));
    expect(Object.keys(dayHash).length).toBeGreaterThan(0);
  });

  it('is idempotent across repeated snapshots, including a fresh recorder reprocessing the buffer', async () => {
    await resetHistory(redis, 'RecorderIdemQueue');
    queue = new Queue('RecorderIdemQueue', { connection });
    worker = new Worker('RecorderIdemQueue', async () => 'ok', {
      connection,
      metrics: { maxDataPoints: MetricsTime.ONE_HOUR },
    });
    for (let i = 0; i < 5; i++) await queue.add('job', {});
    await waitForCompletedCount(queue, 5);
    await forceMetricsFlush(redis, queue);
    await waitForMetrics(queue, 1);

    const adapter = new BullMQAdapter(queue);
    const name = adapter.getName();
    const recorder = new MetricsRecorder({ queues: [adapter], connection: redis });

    await recorder.snapshot();
    const snapshot1 = await redis.hgetall(totalsHashKey(name, 'completed'));

    // No-ops: `recorder`'s in-memory `lastMinute` cursor is already warm, so these never
    // reach HistoryStore.upsertMinute at all.
    await recorder.snapshot();
    await recorder.snapshot();
    const warmSnapshot = await redis.hgetall(totalsHashKey(name, 'completed'));
    recorder.stop();
    expect(warmSnapshot).toEqual(snapshot1);

    // A fresh recorder has a cold cursor, so it re-submits every point to
    // HistoryStore.upsertMinute -- this is what actually proves reprocessing doesn't
    // double-count, exercising upsertMinute's own idempotent no-op path rather than
    // just the recorder's cursor gate.
    const freshRecorder = new MetricsRecorder({ queues: [adapter], connection: redis });
    await freshRecorder.snapshot();
    const snapshot2 = await redis.hgetall(totalsHashKey(name, 'completed'));
    freshRecorder.stop();

    expect(snapshot2).toEqual(snapshot1);
  });

  it('records failed metrics into the history store', async () => {
    await resetHistory(redis, 'RecorderFailedQueue');
    queue = new Queue('RecorderFailedQueue', { connection });
    worker = new Worker(
      'RecorderFailedQueue',
      async (job) => {
        if (job.data.shouldFail) {
          throw new Error('boom');
        }
        return 'ok';
      },
      {
        connection,
        metrics: { maxDataPoints: MetricsTime.ONE_HOUR },
      }
    );

    for (let i = 0; i < 5; i++) await queue.add('job', { shouldFail: true });
    await waitForFailedCount(queue, 5);
    await forceMetricsFlush(redis, queue, 'failed');
    await waitForMetrics(queue, 1, 'failed');

    const adapter = new BullMQAdapter(queue);
    const recorder = new MetricsRecorder({ queues: [adapter], connection: redis });

    await recorder.snapshot();
    recorder.stop();

    const nativeFailed = await adapter.getMetrics('failed');
    const nativeFinalizedSum = nativeFailed.data.reduce((a, b) => a + (Number(b) || 0), 0);

    const name = adapter.getName();
    const days = new Set<string>();
    const prevMinute = Math.floor((nativeFailed.meta.prevTS || Date.now()) / 60000);
    for (let m = prevMinute - nativeFailed.data.length - 1; m <= prevMinute; m++) {
      days.add(minuteToDay(m));
    }
    let storedSum = 0;
    for (const day of days) {
      const v = await redis.hget(totalsHashKey(name, 'failed'), day);
      storedSum += Number(v) || 0;
    }

    expect(storedSum).toBe(nativeFinalizedSum);
    expect(storedSum).toBeGreaterThan(0);
  });

  it('rolls up completed totals from multiple queues into the global totals', async () => {
    await resetHistory(redis, 'RecorderGlobalQueueA');
    await resetHistory(redis, 'RecorderGlobalQueueB');
    const queueA = new Queue('RecorderGlobalQueueA', { connection });
    const workerA = new Worker('RecorderGlobalQueueA', async () => 'ok', {
      connection,
      metrics: { maxDataPoints: MetricsTime.ONE_HOUR },
    });
    const queueB = new Queue('RecorderGlobalQueueB', { connection });
    const workerB = new Worker('RecorderGlobalQueueB', async () => 'ok', {
      connection,
      metrics: { maxDataPoints: MetricsTime.ONE_HOUR },
    });

    try {
      for (let i = 0; i < 5; i++) await queueA.add('job', {});
      for (let i = 0; i < 3; i++) await queueB.add('job', {});
      await waitForCompletedCount(queueA, 5);
      await waitForCompletedCount(queueB, 3);
      await forceMetricsFlush(redis, queueA);
      await forceMetricsFlush(redis, queueB);
      await waitForMetrics(queueA, 1);
      await waitForMetrics(queueB, 1);

      const adapterA = new BullMQAdapter(queueA);
      const adapterB = new BullMQAdapter(queueB);
      const nameA = adapterA.getName();
      const nameB = adapterB.getName();

      // __global__ totals are shared across every queue on this Redis instance, so
      // snapshot the pre-existing totals for the day(s) touched and measure this test's
      // contribution via a before/after delta instead of assuming the hash starts at zero.
      const metricsA = await adapterA.getMetrics('completed');
      const metricsB = await adapterB.getMetrics('completed');
      const days = new Set<string>();
      for (const m of [metricsA, metricsB]) {
        const prevMinute = Math.floor((m.meta.prevTS || Date.now()) / 60000);
        for (let mm = prevMinute - m.data.length - 1; mm <= prevMinute; mm++) {
          days.add(minuteToDay(mm));
        }
      }

      const globalBefore: Record<string, number> = {};
      for (const day of days) {
        globalBefore[day] =
          Number(await redis.hget(totalsHashKey(GLOBAL_QUEUE, 'completed'), day)) || 0;
      }

      const recorder = new MetricsRecorder({ queues: [adapterA, adapterB], connection: redis });
      await recorder.snapshot();
      recorder.stop();

      let sumA = 0;
      let sumB = 0;
      let globalDelta = 0;
      for (const day of days) {
        sumA += Number(await redis.hget(totalsHashKey(nameA, 'completed'), day)) || 0;
        sumB += Number(await redis.hget(totalsHashKey(nameB, 'completed'), day)) || 0;
        const globalAfter =
          Number(await redis.hget(totalsHashKey(GLOBAL_QUEUE, 'completed'), day)) || 0;
        globalDelta += globalAfter - globalBefore[day];
      }

      expect(sumA).toBeGreaterThan(0);
      expect(sumB).toBeGreaterThan(0);
      expect(globalDelta).toBe(sumA + sumB);
    } finally {
      await workerA.close();
      await workerB.close();
      await queueA.obliterate({ force: true }).catch(() => undefined);
      await queueB.obliterate({ force: true }).catch(() => undefined);
      await queueA.close();
      await queueB.close();
    }
  });

  it('is a safe no-op for a queue with no metrics configured', async () => {
    await resetHistory(redis, 'RecorderNoMetricsQueue');
    queue = new Queue('RecorderNoMetricsQueue', { connection });
    // No `metrics` option: BullMQ never runs collectMetrics.lua for this queue, so
    // getMetrics() returns empty data regardless of how long we wait.
    worker = new Worker('RecorderNoMetricsQueue', async () => 'ok', { connection });

    await queue.add('job', {});
    await waitForCompletedCount(queue, 1);

    const adapter = new BullMQAdapter(queue);
    const name = adapter.getName();
    const recorder = new MetricsRecorder({ queues: [adapter], connection: redis });

    await expect(recorder.snapshot()).resolves.not.toThrow();
    recorder.stop();

    const totals = await redis.hgetall(totalsHashKey(name, 'completed'));
    expect(totals).toEqual({});
  });
});
