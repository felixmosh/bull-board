import { Redis } from 'ioredis';
import { emptyVector } from '../src/histogram';
import { HistoryStore } from '../src/HistoryStore';
import { GLOBAL_QUEUE, dayHashKey, hourHashKey, minuteToDay, totalsHashKey } from '../src/keys';
import { LatencyStore, QUEUE_AGE_METRIC } from '../src/LatencyStore';
import { RedisMetricsHistoryProvider } from '../src/RedisMetricsHistoryProvider';

// Pinned to a throwaway logical database. These specs write fixture data into the shared
// `__global__` rollup and clean up by key pattern, which on the default db would both
// pollute and delete a developer's running dev-board history.
const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: +(process.env.REDIS_PORT || 6379),
  db: +(process.env.REDIS_TEST_DB || 15),
};

describe('RedisMetricsHistoryProvider', () => {
  let redis: Redis;
  let store: HistoryStore;
  let provider: RedisMetricsHistoryProvider;

  // Namespaced to a queue/month not used elsewhere (HistoryStore.spec.ts pins 'Q'/'Q2'
  // to 2021-01-01) so parallel Jest workers on the same real Redis -- including the
  // shared __global__ rollup -- don't race.
  const QUEUE = 'RedisMetricsHistoryProvider-Q';
  const days = ['2021-02-01', '2021-02-02', '2021-02-03'];

  const d1m = Date.UTC(2021, 1, 1, 10, 0) / 60000; // 2021-02-01 10:00
  const d1m2 = Date.UTC(2021, 1, 1, 10, 30) / 60000; // same hour
  const d2m = Date.UTC(2021, 1, 2, 5, 0) / 60000; // 2021-02-02 05:00

  async function cleanAll(): Promise<void> {
    const keys: string[] = [];
    for (const day of days) {
      keys.push(
        dayHashKey(QUEUE, 'completed', day),
        dayHashKey(GLOBAL_QUEUE, 'completed', day),
        hourHashKey(QUEUE, 'completed', day),
        hourHashKey(GLOBAL_QUEUE, 'completed', day)
      );
    }
    keys.push(totalsHashKey(QUEUE, 'completed'), totalsHashKey(GLOBAL_QUEUE, 'completed'));
    await redis.del(...keys);
  }

  beforeEach(async () => {
    redis = new Redis(connection);
    store = new HistoryStore({ redis, retention: { minutes: 90, hours: 90, days: 90 } });
    await cleanAll();

    await store.upsertMinute(QUEUE, 'completed', d1m, 3);
    await store.upsertMinute(QUEUE, 'completed', d1m2, 4);
    await store.upsertMinute(QUEUE, 'completed', d2m, 5);
    provider = new RedisMetricsHistoryProvider({ connection: redis });
  });

  afterEach(async () => {
    await redis.quit();
  });

  it('returns a continuous zero-backfilled series when at least one day in range has data', async () => {
    // Feb 3 has no stored data, but Feb 1/2 do -- it must still show up as a zero point,
    // not be omitted or collapse the whole series to [].
    const points = await provider.getHistory({
      queue: QUEUE,
      metric: 'completed',
      from: Date.UTC(2021, 1, 1),
      to: Date.UTC(2021, 1, 3, 23, 59),
      granularity: 'day',
    });
    expect(points).toEqual([
      { ts: Date.UTC(2021, 1, 1), value: 7 },
      { ts: Date.UTC(2021, 1, 2), value: 5 },
      { ts: Date.UTC(2021, 1, 3), value: 0 },
    ]);
  });

  it('returns hourly buckets within range', async () => {
    const points = await provider.getHistory({
      queue: QUEUE,
      metric: 'completed',
      from: Date.UTC(2021, 1, 1),
      to: Date.UTC(2021, 1, 1, 23, 59),
      granularity: 'hour',
    });
    expect(points).toEqual([{ ts: Date.UTC(2021, 1, 1, 10), value: 7 }]);
  });

  it('reads the global rollup when queue is omitted', async () => {
    const points = await provider.getHistory({
      metric: 'completed',
      from: Date.UTC(2021, 1, 1),
      to: Date.UTC(2021, 1, 2, 23, 59),
      granularity: 'day',
    });
    expect(points).toEqual([
      { ts: Date.UTC(2021, 1, 1), value: 7 },
      { ts: Date.UTC(2021, 1, 2), value: 5 },
    ]);
  });

  it('returns an empty array when the range covers no stored data (hourly, sparse series)', async () => {
    const points = await provider.getHistory({
      queue: QUEUE,
      metric: 'completed',
      from: Date.UTC(2021, 1, 5),
      to: Date.UTC(2021, 1, 6, 23, 59),
      granularity: 'hour',
    });
    expect(points).toEqual([]);
  });

  it('filters days outside the requested range', async () => {
    const d3m = Date.UTC(2021, 1, 3, 8, 0) / 60000; // 2021-02-03 08:00
    await store.upsertMinute(QUEUE, 'completed', d3m, 9);

    const points = await provider.getHistory({
      queue: QUEUE,
      metric: 'completed',
      from: Date.UTC(2021, 1, 2),
      to: Date.UTC(2021, 1, 3, 23, 59),
      granularity: 'day',
    });
    expect(points).toEqual([
      { ts: Date.UTC(2021, 1, 2), value: 5 },
      { ts: Date.UTC(2021, 1, 3), value: 9 },
    ]);
  });

  it('buckets minutes from different hours of the same day into distinct hour points', async () => {
    const hour14 = Date.UTC(2021, 1, 1, 14, 15) / 60000;
    await store.upsertMinute(QUEUE, 'completed', hour14, 6);

    const points = await provider.getHistory({
      queue: QUEUE,
      metric: 'completed',
      from: Date.UTC(2021, 1, 1),
      to: Date.UTC(2021, 1, 1, 23, 59),
      granularity: 'hour',
    });
    expect(points).toEqual([
      { ts: Date.UTC(2021, 1, 1, 10), value: 7 },
      { ts: Date.UTC(2021, 1, 1, 14), value: 6 },
    ]);
  });

  it('omits zero-value hours from the sparse hourly series', async () => {
    const points = await provider.getHistory({
      queue: QUEUE,
      metric: 'completed',
      from: Date.UTC(2021, 1, 1),
      to: Date.UTC(2021, 1, 1, 23, 59),
      granularity: 'hour',
    });
    expect(points.some((p) => p.value === 0)).toBe(false);
    expect(points).toHaveLength(1);
  });

  describe('huge range clamping', () => {
    // Isolated queue/day so this doesn't collide with fixtures above or other spec files
    // sharing the real Redis instance.
    const HUGE_RANGE_QUEUE = 'RedisMetricsHistoryProvider-HugeRange-Q';
    const RETENTION_DAYS = 90;
    const HUGE_RANGE_TO = Date.UTC(2999, 0, 1);
    // Inside the retention window measured back from `to` (not wall-clock "now"), matching
    // getHistory's clamp: from = max(query.from, query.to - (retentionDays+1)*day).
    const seededDay = HUGE_RANGE_TO - 5 * 86400000;
    const seededMinute = (seededDay + 5 * 60000) / 60000; // 00:05 UTC on seededDay

    beforeEach(async () => {
      await redis.del(
        dayHashKey(HUGE_RANGE_QUEUE, 'completed', minuteToDay(seededMinute)),
        hourHashKey(HUGE_RANGE_QUEUE, 'completed', minuteToDay(seededMinute)),
        totalsHashKey(HUGE_RANGE_QUEUE, 'completed')
      );
      await store.upsertMinute(HUGE_RANGE_QUEUE, 'completed', seededMinute, 42);
    });

    it('does not throw and returns a bounded array for a huge time range', async () => {
      const points = await provider.getHistory({
        queue: HUGE_RANGE_QUEUE,
        metric: 'completed',
        from: 0,
        to: HUGE_RANGE_TO,
        granularity: 'day',
      });

      expect(points.length).toBeLessThanOrEqual(RETENTION_DAYS + 2);
      const seeded = points.find((p) => p.ts === seededDay);
      expect(seeded?.value).toBe(42);
    });

    it('does not throw and returns a bounded array for a huge time range (hour granularity)', async () => {
      const points = await provider.getHistory({
        queue: HUGE_RANGE_QUEUE,
        metric: 'completed',
        from: 0,
        to: HUGE_RANGE_TO,
        granularity: 'hour',
      });

      // Bounded by the clamped retention window: at most (retentionDays + 1) days,
      // each contributing at most 24 hourly buckets.
      expect(points.length).toBeLessThanOrEqual((RETENTION_DAYS + 2) * 24);
      // seededMinute is 00:05 UTC on seededDay, which falls in the same UTC hour bucket
      // as seededDay's midnight (00:00-00:59).
      const seeded = points.find((p) => p.ts === seededDay);
      expect(seeded?.value).toBe(42);
    });
  });

  describe('no-data vs stored-zero (day granularity)', () => {
    // Isolated queues/days (June/July 2021) not touched by fixtures above, with explicit
    // key resets before/after each test, to avoid stray keys on a shared Redis instance.
    const NO_DATA_QUEUE = 'RedisMetricsHistoryProvider-NoData-Q';
    const STORED_ZERO_QUEUE = 'RedisMetricsHistoryProvider-StoredZero-Q';
    const noDataDays = ['2021-06-01', '2021-06-02'];
    const zeroDay = '2021-07-01';
    const zeroMinute = Date.UTC(2021, 6, 1, 3, 0) / 60000; // 2021-07-01 03:00 UTC

    async function resetKeys(): Promise<void> {
      const keys: string[] = noDataDays.map((day) => dayHashKey(NO_DATA_QUEUE, 'completed', day));
      keys.push(
        totalsHashKey(NO_DATA_QUEUE, 'completed'),
        dayHashKey(STORED_ZERO_QUEUE, 'completed', zeroDay),
        totalsHashKey(STORED_ZERO_QUEUE, 'completed')
      );
      await redis.del(...keys);
    }

    beforeEach(resetKeys);
    afterEach(resetKeys);

    it('returns an empty array when no day in the range was ever recorded', async () => {
      const points = await provider.getHistory({
        queue: NO_DATA_QUEUE,
        metric: 'completed',
        from: Date.UTC(2021, 5, 1),
        to: Date.UTC(2021, 5, 2, 23, 59),
        granularity: 'day',
      });
      expect(points).toEqual([]);
    });

    it('still returns a series (not empty) when a day was explicitly recorded as zero', async () => {
      // Write a nonzero value then correct it to 0 for the same minute: the totals hash
      // field ends up holding '0', which must count as "recorded", not "missing".
      await store.upsertMinute(STORED_ZERO_QUEUE, 'completed', zeroMinute, 5);
      await store.upsertMinute(STORED_ZERO_QUEUE, 'completed', zeroMinute, 0);
      expect(await redis.hget(totalsHashKey(STORED_ZERO_QUEUE, 'completed'), zeroDay)).toBe('0');

      const points = await provider.getHistory({
        queue: STORED_ZERO_QUEUE,
        metric: 'completed',
        from: Date.UTC(2021, 6, 1),
        to: Date.UTC(2021, 6, 1, 23, 59),
        granularity: 'day',
      });
      expect(points).toEqual([{ ts: Date.UTC(2021, 6, 1), value: 0 }]);
    });
  });

  describe('getLatency and queue age', () => {
    // Isolated day/queue combo (September 2019) not touched by any other fixture in this
    // file. totalsHashKey puts the day in a hash FIELD rather than the key name, so a
    // day-scoped key glob can't clean it -- HDEL the specific fields instead, or counts
    // leak across repeated runs (LatencyStore's merge is a read-modify-write, so a leaked
    // field doubles up rather than getting overwritten).
    const LATENCY_DAY = '2019-09-02';
    const QUEUE_AGE_DAY = '2019-09-04';

    async function resetLatencyKeys(): Promise<void> {
      await redis.del(
        hourHashKey(QUEUE, 'runtime', LATENCY_DAY),
        hourHashKey(GLOBAL_QUEUE, 'runtime', LATENCY_DAY),
        hourHashKey(QUEUE, QUEUE_AGE_METRIC, QUEUE_AGE_DAY)
      );
      await redis.hdel(totalsHashKey(QUEUE, 'runtime'), LATENCY_DAY);
      await redis.hdel(totalsHashKey(GLOBAL_QUEUE, 'runtime'), LATENCY_DAY);
      await redis.hdel(totalsHashKey(QUEUE, QUEUE_AGE_METRIC), QUEUE_AGE_DAY);
    }

    beforeEach(resetLatencyKeys);
    afterEach(resetLatencyKeys);

    it('returns percentiles computed from merged buckets', async () => {
      const hour = Math.floor(Date.UTC(2019, 8, 2, 12, 0, 0) / 3600000);
      const latencyStore = new LatencyStore({
        redis,
        retention: { minutes: 7, hours: 90, days: 90 },
      });
      const vector = emptyVector();
      vector[1] = 90; // (10, 25]
      vector[8] = 10; // (2500, 5000]
      await latencyStore.addSamples(QUEUE, 'runtime', hour, vector);

      const points = await provider.getLatency!({
        queue: QUEUE,
        metric: 'runtime',
        from: Date.UTC(2019, 8, 2),
        to: Date.UTC(2019, 8, 3),
        granularity: 'day',
        percentiles: [50, 99],
      });

      expect(points).toHaveLength(1);
      expect(points[0].count).toBe(100);
      expect(points[0].values['50']).toBeLessThanOrEqual(25);
      expect(points[0].values['99']).toBeGreaterThan(2500);
    });

    it('returns an empty series when nothing was recorded', async () => {
      const points = await provider.getLatency!({
        queue: 'NeverRecordedQueue',
        metric: 'runtime',
        from: Date.UTC(2019, 8, 2),
        to: Date.UTC(2019, 8, 3),
        granularity: 'day',
        percentiles: [95],
      });
      expect(points).toEqual([]);
    });

    it('serves queue age through getHistory as a scalar series', async () => {
      const hour = Math.floor(Date.UTC(2019, 8, 4, 9, 0, 0) / 3600000);
      const latencyStore = new LatencyStore({
        redis,
        retention: { minutes: 7, hours: 90, days: 90 },
      });
      await latencyStore.recordQueueAge(QUEUE, hour, 4_200);

      const points = await provider.getHistory({
        queue: QUEUE,
        metric: 'queueage',
        from: Date.UTC(2019, 8, 4),
        to: Date.UTC(2019, 8, 5),
        granularity: 'day',
      });

      expect(points).toEqual([{ ts: Date.UTC(2019, 8, 4), value: 4_200 }]);
    });
  });

  describe('getLatency range granularity', () => {
    // Isolated days (November 2022) not touched by any other fixture in this file. Same
    // totalsHashKey cleanup caveat as the block above: the day lives in a hash FIELD, not
    // the key name, so it has to be HDEL'd explicitly or a leaked field double-counts on
    // the next run (LatencyStore's merge is read-modify-write).
    const RANGE_DAY_A = '2022-11-01';
    const RANGE_DAY_B = '2022-11-02';

    async function resetRangeKeys(): Promise<void> {
      await redis.del(
        hourHashKey(QUEUE, 'runtime', RANGE_DAY_A),
        hourHashKey(QUEUE, 'runtime', RANGE_DAY_B),
        hourHashKey(GLOBAL_QUEUE, 'runtime', RANGE_DAY_A),
        hourHashKey(GLOBAL_QUEUE, 'runtime', RANGE_DAY_B)
      );
      await redis.hdel(totalsHashKey(QUEUE, 'runtime'), RANGE_DAY_A, RANGE_DAY_B);
      await redis.hdel(totalsHashKey(GLOBAL_QUEUE, 'runtime'), RANGE_DAY_A, RANGE_DAY_B);
    }

    beforeEach(resetRangeKeys);
    afterEach(resetRangeKeys);

    it('merges several days into one point whose percentile differs from any individual day', async () => {
      const latencyStore = new LatencyStore({
        redis,
        retention: { minutes: 7, hours: 90, days: 90 },
      });

      // Day A: 100 samples all in the fastest bucket (<=10ms), so day A's own p95 sits
      // right at the bottom of that bucket.
      const hourA = Math.floor(Date.UTC(2022, 10, 1, 12, 0, 0) / 3600000);
      const vectorA = emptyVector();
      vectorA[0] = 100;
      await latencyStore.addSamples(QUEUE, 'runtime', hourA, vectorA);

      // Day B: 100 samples all in the (30000, 60000] bucket, so day B's own p95 sits near
      // the top of that bucket -- three orders of magnitude above day A's.
      const hourB = Math.floor(Date.UTC(2022, 10, 2, 12, 0, 0) / 3600000);
      const vectorB = emptyVector();
      vectorB[11] = 100;
      await latencyStore.addSamples(QUEUE, 'runtime', hourB, vectorB);

      const dayAPoints = await provider.getLatency!({
        queue: QUEUE,
        metric: 'runtime',
        from: Date.UTC(2022, 10, 1),
        to: Date.UTC(2022, 10, 1, 23, 59),
        granularity: 'day',
        percentiles: [95],
      });
      const dayBPoints = await provider.getLatency!({
        queue: QUEUE,
        metric: 'runtime',
        from: Date.UTC(2022, 10, 2),
        to: Date.UTC(2022, 10, 2, 23, 59),
        granularity: 'day',
        percentiles: [95],
      });

      const rangePoints = await provider.getLatency!({
        queue: QUEUE,
        metric: 'runtime',
        from: Date.UTC(2022, 10, 1),
        to: Date.UTC(2022, 10, 2, 23, 59),
        granularity: 'range',
        percentiles: [95],
      });

      expect(rangePoints).toHaveLength(1);
      // A single point covering the whole span, stamped at `from` -- not one point per day.
      expect(rangePoints[0].ts).toBe(Date.UTC(2022, 10, 1));
      // 200 merged samples, not 100 from either day alone.
      expect(rangePoints[0].count).toBe(200);
      // Proves an actual merge happened rather than the endpoint picking one day's vector:
      // the range p95 sits between the two per-day p95s and matches neither.
      expect(rangePoints[0].values['95']).not.toBe(dayAPoints[0].values['95']);
      expect(rangePoints[0].values['95']).not.toBe(dayBPoints[0].values['95']);
      expect(rangePoints[0].values['95']).toBeGreaterThan(dayAPoints[0].values['95']);
      expect(rangePoints[0].values['95']).toBeLessThan(dayBPoints[0].values['95']);
    });

    it('returns an empty array for a range query over unrecorded days', async () => {
      const points = await provider.getLatency!({
        queue: 'RedisMetricsHistoryProvider-Range-NeverRecorded-Q',
        metric: 'runtime',
        from: Date.UTC(2022, 10, 1),
        to: Date.UTC(2022, 10, 2, 23, 59),
        granularity: 'range',
        percentiles: [95],
      });
      expect(points).toEqual([]);
    });
  });

  describe('owned connection (plain connection options, not a Redis instance)', () => {
    it('constructs its own Redis client, serves a query, and disconnects without throwing', async () => {
      const ownedProvider = new RedisMetricsHistoryProvider({ connection });

      const points = await ownedProvider.getHistory({
        queue: QUEUE,
        metric: 'completed',
        from: Date.UTC(2021, 1, 1),
        to: Date.UTC(2021, 1, 1, 23, 59),
        granularity: 'day',
      });
      expect(Array.isArray(points)).toBe(true);

      expect(() => ownedProvider.disconnect()).not.toThrow();
    });
  });
});
