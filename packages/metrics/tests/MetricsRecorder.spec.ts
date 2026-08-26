import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import type { MetricsType } from '@bull-board/api/typings/app';
import { MetricsTime, Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { vectorTotal } from '../src/histogram';
import { GLOBAL_QUEUE, NAMESPACE, dayHashKey, minuteToDay, totalsHashKey } from '../src/keys';
import { LatencyStore } from '../src/LatencyStore';
import { DEFAULT_RETENTION, MetricsRecorder, resolveRetention } from '../src/MetricsRecorder';

// Pinned to a throwaway logical database. These specs write fixture data into the shared
// `__global__` rollup and clean up by key pattern, which on the default db would both
// pollute and delete a developer's running dev-board history.
const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: +(process.env.REDIS_PORT || 6379),
  db: +(process.env.REDIS_TEST_DB || 15),
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

async function waitFor(predicate: () => boolean, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('condition was not met in time');
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
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

  it('keeps the recorded failures after the jobs behind them are cleaned away', async () => {
    await resetHistory(redis, 'RecorderCleanedQueue');
    queue = new Queue('RecorderCleanedQueue', { connection });
    worker = new Worker(
      'RecorderCleanedQueue',
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

    for (let i = 0; i < 4; i++) await queue.add('job', { shouldFail: true });
    await waitForFailedCount(queue, 4);
    await forceMetricsFlush(redis, queue, 'failed');
    await waitForFailedCount(queue, 5);
    await waitForMetrics(queue, 1, 'failed');

    const adapter = new BullMQAdapter(queue);
    const name = adapter.getName();
    const recorder = new MetricsRecorder({ queues: [adapter], connection: redis, latency: false });
    await recorder.snapshot();

    const minute = Math.floor(Date.now() / 60000);
    const days = [...new Set([minuteToDay(minute - 3), minuteToDay(minute)])];
    const storedFailures = async () => {
      let sum = 0;
      for (const day of days) {
        sum += Number(await redis.hget(totalsHashKey(name, 'failed'), day)) || 0;
      }
      return sum;
    };

    const recorded = await storedFailures();
    expect(recorded).toBeGreaterThan(0);

    await queue.clean(0, 100, 'failed');
    expect((await adapter.getJobCounts()).failed).toBe(0);
    await recorder.snapshot();
    recorder.stop();

    expect(await storedFailures()).toBe(recorded);
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

  describe('retention configuration', () => {
    it('defaults to a short minute window and a long daily window', () => {
      expect(resolveRetention({})).toEqual(DEFAULT_RETENTION);
    });

    it('treats retentionDays as the daily and hourly window, leaving minutes alone', () => {
      // The minute tier is the one that costs, so the legacy shorthand must not
      // silently blow it up to a full year of minute-level detail.
      expect(resolveRetention({ retentionDays: 365 })).toEqual({
        minutes: DEFAULT_RETENTION.minutes,
        hours: 365,
        days: 365,
      });
    });

    it('never lets the shorthand push minutes past the requested window', () => {
      expect(resolveRetention({ retentionDays: 2 })).toEqual({ minutes: 2, hours: 2, days: 2 });
    });

    it('lets an explicit tier override win', () => {
      expect(resolveRetention({ retentionDays: 30, retention: { minutes: 30 } })).toEqual({
        minutes: 30,
        hours: 30,
        days: 30,
      });
    });
  });

  describe('backfill window', () => {
    // These cases drive a synthetic adapter rather than a real BullMQ queue, and they
    // write thousands of recent minutes into the shared `__global__` rollup. Pinned to a
    // throwaway logical database so they can't distort or delete a developer's dev-board
    // history on the default one.
    let scratch: Redis;

    beforeEach(() => {
      scratch = new Redis({ ...connection, db: +(process.env.REDIS_TEST_DB || 15) });
    });

    afterEach(async () => {
      const keys = await scratch.keys(`${NAMESPACE}:*`);
      if (keys.length > 0) {
        await scratch.del(...keys);
      }
      await scratch.quit();
    });

    /**
     * Minimal stand-in for a queue whose worker keeps a metrics buffer reaching further
     * back than the recorder's minute window. Real BullMQ can't be coerced into producing
     * days of backdated buckets on demand, and the shape consumed here is exactly the two
     * fields metricsToMinutePoints reads.
     */
    function fakeAdapter(name: string, data: number[], prevTS: number) {
      return {
        getName: () => name,
        getMetrics: async (metric: MetricsType) =>
          metric === 'completed'
            ? { meta: { count: 0, prevCount: 0, prevTS }, data, count: 0 }
            : { meta: { count: 0, prevCount: 0, prevTS }, data: [], count: 0 },
      } as unknown as BullMQAdapter;
    }

    const MINUTES_PER_DAY = 1440;

    it('refuses to write minutes older than the minute window', async () => {
      const name = 'RecorderBackfillQueue';
      const now = Date.now();
      const newestMinute = Math.floor(now / 60000) - 1;
      // Two days of buckets against a one-day window: the older half must be dropped.
      const data = Array.from({ length: 2 * MINUTES_PER_DAY }, () => 1);

      const recorder = new MetricsRecorder({
        queues: [fakeAdapter(name, data, now)],
        connection: scratch,
        retention: { minutes: 1 },
      });
      await recorder.snapshot();
      recorder.stop();

      const stored: number[] = [];
      for (const day of [minuteToDay(newestMinute), minuteToDay(newestMinute - MINUTES_PER_DAY)]) {
        stored.push(
          ...Object.keys(await scratch.hgetall(dayHashKey(name, 'completed', day))).map(Number)
        );
      }

      expect(stored.length).toBeGreaterThan(0);
      expect(stored.length).toBeLessThan(data.length);
      // Allow a couple of minutes of slack for the clock moving during the snapshot.
      expect(Math.min(...stored)).toBeGreaterThanOrEqual(newestMinute - MINUTES_PER_DAY - 2);
    });

    it('does not double count a day whose minute hash has already expired', async () => {
      // The regression this guards: a restart clears the in-memory watermark, so the
      // recorder rewalks the worker's buffer. If it rewrote a minute whose hash had aged
      // out, the coarser tiers would take the value a second time. Here the day is
      // pre-seeded exactly as if it had been recorded and its minute hash then expired.
      const name = 'RecorderExpiredMinutesQueue';
      const now = Date.now();
      const newestMinute = Math.floor(now / 60000) - 1;
      const staleDay = minuteToDay(newestMinute - 3 * MINUTES_PER_DAY);

      await scratch.hset(totalsHashKey(name, 'completed'), staleDay, '500');
      await scratch.hset(totalsHashKey(GLOBAL_QUEUE, 'completed'), staleDay, '500');

      const data = Array.from({ length: 4 * MINUTES_PER_DAY }, () => 1);
      const recorder = new MetricsRecorder({
        queues: [fakeAdapter(name, data, now)],
        connection: scratch,
        retention: { minutes: 1 },
      });
      await recorder.snapshot();
      recorder.stop();

      expect(await scratch.hget(totalsHashKey(name, 'completed'), staleDay)).toBe('500');
      expect(await scratch.exists(dayHashKey(name, 'completed', staleDay))).toBe(0);
    });
  });

  describe('latency option', () => {
    it('samples latency by default', async () => {
      const queue = new Queue('LatencyOptionQueue', { connection });
      const recorder = new MetricsRecorder({
        queues: [new BullMQAdapter(queue)],
        connection,
      });
      expect(recorder.latencyEnabled).toBe(true);
      recorder.stop();
      await queue.close();
    });

    it('can be constructed with latency disabled', async () => {
      const queue = new Queue('LatencyOptionQueue', { connection });
      const recorder = new MetricsRecorder({
        queues: [new BullMQAdapter(queue)],
        connection,
        latency: false,
      });
      expect(recorder.latencyEnabled).toBe(false);
      recorder.stop();
      await queue.close();
    });

    it('samples runtime durations into the latency store when snapshot() runs, by default', async () => {
      const JOB_DURATION_MS = 40;
      const JOB_COUNT = 5;

      await resetHistory(redis, 'LatencyWiringQueue');
      const latencyQueue = new Queue('LatencyWiringQueue', { connection });
      const latencyWorker = new Worker(
        'LatencyWiringQueue',
        async () => {
          await new Promise((r) => setTimeout(r, JOB_DURATION_MS));
          return 'ok';
        },
        { connection }
      );

      try {
        for (let i = 0; i < JOB_COUNT; i++) await latencyQueue.add('job', {});
        await waitForCompletedCount(latencyQueue, JOB_COUNT);

        const adapter = new BullMQAdapter(latencyQueue);
        const name = adapter.getName();
        // safetyMarginMs: 0 so jobs that just completed are immediately in scan range,
        // rather than sleeping past the sampler's default 5s margin.
        const recorder = new MetricsRecorder({
          queues: [adapter],
          connection,
          latencySafetyMarginMs: 0,
        });

        await recorder.snapshot();
        const retention = recorder.retention;
        recorder.stop();

        const store = new LatencyStore({ redis, retention });
        const day = minuteToDay(Math.floor(Date.now() / 60000));
        const runtimeByDay = await store.readRange(name, 'runtime', 'day', [day]);

        expect(vectorTotal(runtimeByDay[day] ?? [])).toBe(JOB_COUNT);
      } finally {
        await latencyWorker.close();
        await latencyQueue.obliterate({ force: true }).catch(() => undefined);
        await latencyQueue.close();
      }
    });

    it('writes no runtime data when latency is disabled, proving the flag gates the sampler call', async () => {
      const JOB_DURATION_MS = 40;
      const JOB_COUNT = 5;

      await resetHistory(redis, 'LatencyWiringDisabledQueue');
      const latencyQueue = new Queue('LatencyWiringDisabledQueue', { connection });
      const latencyWorker = new Worker(
        'LatencyWiringDisabledQueue',
        async () => {
          await new Promise((r) => setTimeout(r, JOB_DURATION_MS));
          return 'ok';
        },
        { connection }
      );

      try {
        for (let i = 0; i < JOB_COUNT; i++) await latencyQueue.add('job', {});
        await waitForCompletedCount(latencyQueue, JOB_COUNT);

        const adapter = new BullMQAdapter(latencyQueue);
        const name = adapter.getName();
        const recorder = new MetricsRecorder({
          queues: [adapter],
          connection,
          latency: false,
          latencySafetyMarginMs: 0,
        });

        await recorder.snapshot();
        const retention = recorder.retention;
        recorder.stop();

        const store = new LatencyStore({ redis, retention });
        const day = minuteToDay(Math.floor(Date.now() / 60000));
        const runtimeByDay = await store.readRange(name, 'runtime', 'day', [day]);

        expect(runtimeByDay[day]).toBeUndefined();
      } finally {
        await latencyWorker.close();
        await latencyQueue.obliterate({ force: true }).catch(() => undefined);
        await latencyQueue.close();
      }
    });
  });

  describe('timer lifecycle', () => {
    const queueName = 'RecorderLifecycleQueue';
    let queue: Queue;
    let recorder: MetricsRecorder | undefined;

    beforeEach(async () => {
      recorder = undefined;
      await resetHistory(redis, queueName);
      queue = new Queue(queueName, { connection });
    });

    afterEach(async () => {
      recorder?.stop();
      await queue.obliterate({ force: true }).catch(() => undefined);
      await queue.close();
    });

    const makeRecorder = (snapshotIntervalMs: number) =>
      new MetricsRecorder({
        queues: [new BullMQAdapter(queue)],
        connection: redis,
        snapshotIntervalMs,
      });

    it('snapshots once immediately and again on every interval', async () => {
      recorder = makeRecorder(50);
      const snapshot = jest.spyOn(recorder, 'snapshot');

      recorder.start();
      expect(snapshot).toHaveBeenCalledTimes(1);

      await waitFor(() => snapshot.mock.calls.length >= 3);
    });

    it('ignores a second start rather than scheduling a second timer', () => {
      recorder = makeRecorder(10_000);
      const snapshot = jest.spyOn(recorder, 'snapshot');

      recorder.start();
      const timer = (recorder as any).timer;
      recorder.start();

      expect(snapshot).toHaveBeenCalledTimes(1);
      expect((recorder as any).timer).toBe(timer);
    });

    it('leaves its timer unreferenced, so it cannot hold the event loop open', () => {
      recorder = makeRecorder(10_000);

      recorder.start();

      expect((recorder as any).timer.hasRef()).toBe(false);
    });

    it('stops snapshotting once stopped', async () => {
      recorder = makeRecorder(50);
      const snapshot = jest.spyOn(recorder, 'snapshot');

      recorder.start();
      await waitFor(() => snapshot.mock.calls.length >= 2);

      recorder.stop();
      const afterStop = snapshot.mock.calls.length;
      await new Promise((r) => setTimeout(r, 250));

      expect(snapshot).toHaveBeenCalledTimes(afterStop);
      expect((recorder as any).timer).toBeNull();
    });

    it('disconnects the redis client it opened itself', async () => {
      const owning = new MetricsRecorder({ queues: [new BullMQAdapter(queue)], connection });
      const own: Redis = (owning as any).redis;
      await own.ping();

      owning.stop();

      await waitFor(() => own.status === 'end');
    });

    it("leaves a caller's own redis client connected", async () => {
      recorder = new MetricsRecorder({ queues: [new BullMQAdapter(queue)], connection: redis });

      recorder.stop();

      expect(await redis.ping()).toBe('PONG');
    });

    it('is safe to stop twice, leaving no reconnect timer behind', async () => {
      const owning = new MetricsRecorder({ queues: [new BullMQAdapter(queue)], connection });
      const own: Redis = (owning as any).redis;
      await own.ping();
      const disconnect = jest.spyOn(own, 'disconnect');

      owning.stop();
      owning.stop();

      expect(disconnect).toHaveBeenCalledTimes(1);
      await waitFor(() => own.status === 'end');
    });

    it('skips a snapshot while the previous one is still running', async () => {
      const adapter = new BullMQAdapter(queue);
      const inFlight = deferred<null>();
      const getMetrics = jest
        .spyOn(adapter, 'getMetrics')
        .mockReturnValueOnce(inFlight.promise as any);
      recorder = new MetricsRecorder({ queues: [adapter], connection: redis, latency: false });

      const firstPass = recorder.snapshot();
      await recorder.snapshot();

      expect(getMetrics).toHaveBeenCalledTimes(1);

      inFlight.resolve(null);
      await firstPass;
    });
  });
});
