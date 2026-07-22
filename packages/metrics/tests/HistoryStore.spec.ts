import { Redis } from 'ioredis';
import { HistoryStore } from '../src/HistoryStore';
import {
  GLOBAL_QUEUE,
  NAMESPACE,
  dayHashKey,
  hourHashKey,
  minuteToDay,
  minuteToHour,
  totalsHashKey,
} from '../src/keys';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: +(process.env.REDIS_PORT || 6379),
};

describe('HistoryStore', () => {
  let redis: Redis;
  let store: HistoryStore;
  const minute = Date.UTC(2021, 0, 1, 0, 5) / 60000;
  const day = minuteToDay(minute);

  beforeEach(async () => {
    redis = new Redis(connection);
    store = new HistoryStore({ redis, retention: { minutes: 90, hours: 90, days: 90 } });
    await redis.del(
      dayHashKey('Q', 'completed', day),
      totalsHashKey('Q', 'completed'),
      dayHashKey(GLOBAL_QUEUE, 'completed', day),
      totalsHashKey(GLOBAL_QUEUE, 'completed'),
      dayHashKey('Q2', 'completed', day),
      totalsHashKey('Q2', 'completed'),
      hourHashKey('Q', 'completed', day),
      hourHashKey(GLOBAL_QUEUE, 'completed', day),
      hourHashKey('Q2', 'completed', day)
    );
  });

  afterEach(async () => {
    await redis.quit();
  });

  it('writes the minute, queue total, global minute, and global total', async () => {
    await store.upsertMinute('Q', 'completed', minute, 4);

    expect(await redis.hget(dayHashKey('Q', 'completed', day), String(minute))).toBe('4');
    expect(await redis.hget(totalsHashKey('Q', 'completed'), day)).toBe('4');
    expect(await redis.hget(dayHashKey(GLOBAL_QUEUE, 'completed', day), String(minute))).toBe('4');
    expect(await redis.hget(totalsHashKey(GLOBAL_QUEUE, 'completed'), day)).toBe('4');
  });

  it('is idempotent: re-writing the same minute does not double count', async () => {
    await store.upsertMinute('Q', 'completed', minute, 4);
    await store.upsertMinute('Q', 'completed', minute, 4);
    await store.upsertMinute('Q', 'completed', minute, 4);

    expect(await redis.hget(totalsHashKey('Q', 'completed'), day)).toBe('4');
    expect(await redis.hget(totalsHashKey(GLOBAL_QUEUE, 'completed'), day)).toBe('4');
  });

  it('applies a delta when a minute value is corrected upward', async () => {
    await store.upsertMinute('Q', 'completed', minute, 4);
    await store.upsertMinute('Q', 'completed', minute, 7);

    expect(await redis.hget(dayHashKey('Q', 'completed', day), String(minute))).toBe('7');
    expect(await redis.hget(totalsHashKey('Q', 'completed'), day)).toBe('7');
  });

  it('accumulates the global rollup across queues', async () => {
    await store.upsertMinute('Q', 'completed', minute, 4);
    await store.upsertMinute('Q2', 'completed', minute, 6);

    expect(await redis.hget(dayHashKey(GLOBAL_QUEUE, 'completed', day), String(minute))).toBe('10');
    expect(await redis.hget(totalsHashKey(GLOBAL_QUEUE, 'completed'), day)).toBe('10');
  });

  it('sets a TTL on the day hash', async () => {
    await store.upsertMinute('Q', 'completed', minute, 4);

    const keys = [
      dayHashKey('Q', 'completed', day),
      totalsHashKey('Q', 'completed'),
      dayHashKey(GLOBAL_QUEUE, 'completed', day),
      totalsHashKey(GLOBAL_QUEUE, 'completed'),
    ];

    for (const key of keys) {
      const ttl = await redis.ttl(key);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(90 * 86400);
    }
  });

  it('reads daily totals (raw) and day minutes back', async () => {
    await store.upsertMinute('Q', 'completed', minute, 4);
    expect(await store.readDailyTotalsRaw('Q', 'completed', [day])).toEqual(['4']);
    expect(await store.readDayMinutes('Q', 'completed', day)).toEqual({ [String(minute)]: 4 });
  });

  it('does not throw for a large field list (pins the hmget spread fix)', async () => {
    // Regression test: readDailyTotalsRaw used to spread `days` into hmget's call args
    // (`hmget(key, ...days)`), which blows the JS argument-count limit for a large enough
    // array. ~20000 synthetic day strings (none in the totals hash) reproduce that.
    const bigDays = Array.from(
      { length: 20000 },
      (_, i) => `1970-01-${String((i % 28) + 1).padStart(2, '0')}`
    );

    const totals = await store.readDailyTotalsRaw('Q', 'completed', bigDays);

    expect(totals).toHaveLength(bigDays.length);
    expect(totals.every((v) => v === null)).toBe(true);
  });

  it('applies a downward correction: minute and day total both drop', async () => {
    await store.upsertMinute('Q', 'completed', minute, 7);
    await store.upsertMinute('Q', 'completed', minute, 4);

    expect(await redis.hget(dayHashKey('Q', 'completed', day), String(minute))).toBe('4');
    expect(await redis.hget(totalsHashKey('Q', 'completed'), day)).toBe('4');
  });

  it('readDayMinutes on a never-written day returns {} without throwing', async () => {
    await expect(store.readDayMinutes('Q', 'completed', '1970-01-01')).resolves.toEqual({});
  });

  describe('hourly rollup', () => {
    it('folds minutes of the same hour into one bucket, per queue and globally', async () => {
      const hourStart = Math.floor(minute / 60) * 60;
      await store.upsertMinute('Q', 'completed', hourStart, 4);
      await store.upsertMinute('Q', 'completed', hourStart + 30, 6);
      await store.upsertMinute('Q2', 'completed', hourStart + 10, 1);

      const hour = String(minuteToHour(minute));
      expect(await redis.hget(hourHashKey('Q', 'completed', day), hour)).toBe('10');
      expect(await redis.hget(hourHashKey(GLOBAL_QUEUE, 'completed', day), hour)).toBe('11');
    });

    it('separates distinct hours of the same day', async () => {
      const hourStart = Math.floor(minute / 60) * 60;
      await store.upsertMinute('Q', 'completed', hourStart, 4);
      await store.upsertMinute('Q', 'completed', hourStart + 60, 7);

      expect(await redis.hgetall(hourHashKey('Q', 'completed', day))).toEqual({
        [String(minuteToHour(hourStart))]: '4',
        [String(minuteToHour(hourStart + 60))]: '7',
      });
    });

    it('stays consistent with the minute tier under re-writes and corrections', async () => {
      await store.upsertMinute('Q', 'completed', minute, 4);
      await store.upsertMinute('Q', 'completed', minute, 4);
      await store.upsertMinute('Q', 'completed', minute, 9);
      await store.upsertMinute('Q', 'completed', minute, 2);

      const hour = String(minuteToHour(minute));
      expect(await redis.hget(hourHashKey('Q', 'completed', day), hour)).toBe('2');
      expect(await redis.hget(totalsHashKey('Q', 'completed'), day)).toBe('2');
    });

    it('readDayHours prefers the rollup and falls back to folding minutes', async () => {
      await store.upsertMinute('Q', 'completed', minute, 4);
      const hour = String(minuteToHour(minute));

      expect(await store.readDayHours('Q', 'completed', day)).toEqual({ [hour]: 4 });

      // Simulates a day recorded before the hourly tier existed: only minutes survive.
      await redis.del(hourHashKey('Q', 'completed', day));

      expect(await store.readDayHours('Q', 'completed', day)).toEqual({ [hour]: 4 });
    });

    it('readDayHours on a never-written day returns {}', async () => {
      await expect(store.readDayHours('Q', 'completed', '1970-01-01')).resolves.toEqual({});
    });
  });

  describe('per-tier retention', () => {
    it('gives each tier its own TTL', async () => {
      const tiered = new HistoryStore({
        redis,
        retention: { minutes: 2, hours: 30, days: 90 },
      });
      await tiered.upsertMinute('Q', 'completed', minute, 4);

      const ttlOf = (key: string) => redis.ttl(key);

      expect(await ttlOf(dayHashKey('Q', 'completed', day))).toBeLessThanOrEqual(2 * 86400);
      expect(await ttlOf(hourHashKey('Q', 'completed', day))).toBeGreaterThan(2 * 86400);
      expect(await ttlOf(hourHashKey('Q', 'completed', day))).toBeLessThanOrEqual(30 * 86400);
      expect(await ttlOf(totalsHashKey('Q', 'completed'))).toBeGreaterThan(30 * 86400);
      expect(await ttlOf(totalsHashKey('Q', 'completed'))).toBeLessThanOrEqual(90 * 86400);

      // The global mirror is retained on the same schedule as the per-queue keys.
      expect(await ttlOf(dayHashKey(GLOBAL_QUEUE, 'completed', day))).toBeLessThanOrEqual(
        2 * 86400
      );
      expect(await ttlOf(hourHashKey(GLOBAL_QUEUE, 'completed', day))).toBeGreaterThan(2 * 86400);
    });
  });

  describe('totals retention', () => {
    const shortStore = () =>
      new HistoryStore({ redis, retention: { minutes: 2, hours: 2, days: 2 } });
    const minuteOn = (offsetDays: number) => minute + offsetDays * 1440;

    afterEach(async () => {
      const keys = await redis.keys(`${NAMESPACE}:Q*:completed:*`);
      const globals = await redis.keys(`${NAMESPACE}:${GLOBAL_QUEUE}:completed:*`);
      if (keys.length + globals.length > 0) {
        await redis.del(...keys, ...globals);
      }
    });

    it('drops day totals older than the retention window', async () => {
      const store = shortStore();
      for (const offset of [0, 1, 2, 3]) {
        await store.upsertMinute('Q', 'completed', minuteOn(offset), 1);
      }

      const days = await redis.hkeys(totalsHashKey('Q', 'completed'));

      expect(days.sort()).toEqual([1, 2, 3].map((o) => minuteToDay(minuteOn(o))));
      expect(days).not.toContain(day);
    });

    it('trims the global totals hash too', async () => {
      const store = shortStore();
      await store.upsertMinute('Q', 'completed', minuteOn(0), 1);
      await store.upsertMinute('Q2', 'completed', minuteOn(0), 1);
      await store.upsertMinute('Q', 'completed', minuteOn(3), 1);

      const days = await redis.hkeys(totalsHashKey(GLOBAL_QUEUE, 'completed'));

      expect(days).toEqual([minuteToDay(minuteOn(3))]);
    });

    it('keeps writing within a day cheap: no trim on repeat writes for the same day', async () => {
      const store = shortStore();
      await store.upsertMinute('Q', 'completed', minuteOn(0), 1);
      // Backdate a day that is already outside the window. A same-day write must not
      // create a new day field, so the stale entry survives until the next day rolls in.
      await redis.hset(totalsHashKey('Q', 'completed'), '1999-01-01', 5);
      await store.upsertMinute('Q', 'completed', minuteOn(0) + 1, 1);

      expect(await redis.hexists(totalsHashKey('Q', 'completed'), '1999-01-01')).toBe(1);

      await store.upsertMinute('Q', 'completed', minuteOn(1), 1);

      expect(await redis.hexists(totalsHashKey('Q', 'completed'), '1999-01-01')).toBe(0);
    });

    it('trims a backlog larger than one HDEL batch', async () => {
      const store = shortStore();
      const backlog: Record<string, string> = {};
      for (let i = 0; i < 400; i++) {
        backlog[minuteToDay(minuteOn(-400 + i))] = '1';
      }
      await redis.hset(totalsHashKey('Q', 'completed'), backlog);

      await store.upsertMinute('Q', 'completed', minuteOn(0), 1);

      // 400 stale days collapse to the retention window: the cutoff day and everything after.
      expect((await redis.hkeys(totalsHashKey('Q', 'completed'))).sort()).toEqual([
        minuteToDay(minuteOn(-2)),
        minuteToDay(minuteOn(-1)),
        day,
      ]);
    });
  });
});
