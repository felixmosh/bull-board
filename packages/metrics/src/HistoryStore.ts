import type { Redis } from 'ioredis';
import { GLOBAL_QUEUE, dayHashKey, minuteToDay, totalsHashKey } from './keys';

/**
 * Atomic, idempotent upsert of one minute bucket.
 *
 * KEYS[1] queue day-minute hash     ARGV[1] minute field
 * KEYS[2] queue totals hash         ARGV[2] day field
 * KEYS[3] global day-minute hash    ARGV[3] value
 * KEYS[4] global totals hash        ARGV[4] ttl seconds
 */
const UPSERT_MINUTE = `
local old = tonumber(redis.call('HGET', KEYS[1], ARGV[1]) or '0')
local val = tonumber(ARGV[3])
if val == old then
  return 0
end
local delta = val - old
redis.call('HSET', KEYS[1], ARGV[1], val)
redis.call('HINCRBY', KEYS[2], ARGV[2], delta)
redis.call('HINCRBY', KEYS[3], ARGV[1], delta)
redis.call('HINCRBY', KEYS[4], ARGV[2], delta)
redis.call('EXPIRE', KEYS[1], ARGV[4])
redis.call('EXPIRE', KEYS[2], ARGV[4])
redis.call('EXPIRE', KEYS[3], ARGV[4])
redis.call('EXPIRE', KEYS[4], ARGV[4])
return delta
`;

export class HistoryStore {
  private readonly redis: Redis;
  private readonly ttlSeconds: number;

  constructor(opts: { redis: Redis; retentionDays: number }) {
    this.redis = opts.redis;
    this.ttlSeconds = Math.max(1, Math.floor(opts.retentionDays * 86400));
  }

  async upsertMinute(queue: string, metric: string, minute: number, value: number): Promise<void> {
    const day = minuteToDay(minute);
    await this.redis.eval(
      UPSERT_MINUTE,
      4,
      dayHashKey(queue, metric, day),
      totalsHashKey(queue, metric),
      dayHashKey(GLOBAL_QUEUE, metric, day),
      totalsHashKey(GLOBAL_QUEUE, metric),
      String(minute),
      day,
      String(value),
      String(this.ttlSeconds)
    );
  }

  /**
   * Raw HMGET of the totals hash: `null` means the day was never recorded, a present
   * string (including `'0'`) means it was. Distinguishing "missing" from "stored zero"
   * matters for callers deciding between empty history vs. a zero-backfilled series.
   */
  async readDailyTotalsRaw(
    queue: string,
    metric: string,
    days: string[]
  ): Promise<(string | null)[]> {
    if (days.length === 0) {
      return [];
    }
    // Pass `days` as a single array (ioredis flattens one level internally) instead of
    // spreading it: spreading blows the JS argument-count limit for large ranges
    // ("Maximum call stack size exceeded"). The cast works around ioredis's types only
    // declaring the spread overload; kept as a method call to preserve `this` binding.
    const redis = this.redis as unknown as {
      hmget(key: string, fields: string[]): Promise<(string | null)[]>;
    };
    return redis.hmget(totalsHashKey(queue, metric), days);
  }

  async readDayMinutes(
    queue: string,
    metric: string,
    day: string
  ): Promise<Record<string, number>> {
    const raw = await this.redis.hgetall(dayHashKey(queue, metric, day));
    const out: Record<string, number> = {};
    for (const field of Object.keys(raw)) {
      out[field] = Number(raw[field]) || 0;
    }
    return out;
  }
}
