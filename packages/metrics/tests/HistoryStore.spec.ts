import { Redis } from 'ioredis';
import { HistoryStore } from '../src/HistoryStore';
import { GLOBAL_QUEUE, dayHashKey, minuteToDay, totalsHashKey } from '../src/keys';

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
    store = new HistoryStore({ redis, retentionDays: 90 });
    await redis.del(
      dayHashKey('Q', 'completed', day),
      totalsHashKey('Q', 'completed'),
      dayHashKey(GLOBAL_QUEUE, 'completed', day),
      totalsHashKey(GLOBAL_QUEUE, 'completed'),
      dayHashKey('Q2', 'completed', day),
      totalsHashKey('Q2', 'completed')
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
});
