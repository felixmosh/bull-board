import type { Redis } from 'ioredis';
import {
  GLOBAL_QUEUE,
  dayHashKey,
  hourHashKey,
  minuteToDay,
  minuteToHour,
  shiftDay,
  totalsHashKey,
} from './keys';

export interface Retention {
  /** Days of minute-level detail. Doubles as the recorder's catch-up window. */
  minutes: number;
  /** Days of hourly rollup. */
  hours: number;
  /** Days of daily totals, which is what the shipped charts read. */
  days: number;
}

/**
 * Atomic, idempotent upsert of one minute bucket into all three resolutions at once.
 *
 * KEYS[1] queue minute hash     ARGV[1] minute field   ARGV[5] minute-tier ttl seconds
 * KEYS[2] queue hour hash       ARGV[2] hour field     ARGV[6] hour-tier ttl seconds
 * KEYS[3] queue totals hash     ARGV[3] day field      ARGV[7] day-tier ttl seconds
 * KEYS[4] global minute hash    ARGV[4] value          ARGV[8] oldest day to keep
 * KEYS[5] global hour hash
 * KEYS[6] global totals hash
 *
 * The minute hash is the ledger the whole thing is built on: `delta` is the difference
 * against the value already stored there, so re-snapshotting an overlapping window (a
 * restart, or a second recorder process) applies a delta of zero and the coarser tiers
 * never double-count. Rolling up on write rather than compacting later keeps that property:
 * one script, one delta, every resolution consistent, nothing to schedule or resume.
 *
 * Retention is per tier. Day-scoped keys fall off on their own, since their TTL is only
 * refreshed while that day is being written, so each dies its tier's retention after the
 * day it holds. The totals hashes are written every day, so their TTL keeps rolling forward
 * and they would otherwise grow a field per day forever; they are trimmed here instead.
 * Day fields are ISO `YYYY-MM-DD`, which sorts lexicographically, so a plain string compare
 * against the cutoff is enough. Trimming only runs on the first write of a new day, which
 * is about once a day per queue.
 */
const UPSERT_MINUTE = `
local function trim(key, cutoff)
  local fields = redis.call('HKEYS', key)
  local stale = {}
  for i = 1, #fields do
    if fields[i] < cutoff then
      stale[#stale + 1] = fields[i]
      if #stale == 256 then
        redis.call('HDEL', key, unpack(stale))
        stale = {}
      end
    end
  end
  if #stale > 0 then
    redis.call('HDEL', key, unpack(stale))
  end
end

local old = tonumber(redis.call('HGET', KEYS[1], ARGV[1]) or '0')
local val = tonumber(ARGV[4])
if val == old then
  return 0
end
local delta = val - old
local newDay = redis.call('HEXISTS', KEYS[3], ARGV[3]) == 0
redis.call('HSET', KEYS[1], ARGV[1], val)
redis.call('HINCRBY', KEYS[2], ARGV[2], delta)
redis.call('HINCRBY', KEYS[3], ARGV[3], delta)
redis.call('HINCRBY', KEYS[4], ARGV[1], delta)
redis.call('HINCRBY', KEYS[5], ARGV[2], delta)
redis.call('HINCRBY', KEYS[6], ARGV[3], delta)
redis.call('EXPIRE', KEYS[1], ARGV[5])
redis.call('EXPIRE', KEYS[2], ARGV[6])
redis.call('EXPIRE', KEYS[3], ARGV[7])
redis.call('EXPIRE', KEYS[4], ARGV[5])
redis.call('EXPIRE', KEYS[5], ARGV[6])
redis.call('EXPIRE', KEYS[6], ARGV[7])
if newDay then
  trim(KEYS[3], ARGV[8])
  trim(KEYS[6], ARGV[8])
end
return delta
`;

const SECONDS_PER_DAY = 86400;

function ttl(days: number): string {
  return String(Math.max(1, Math.floor(days * SECONDS_PER_DAY)));
}

export class HistoryStore {
  private readonly redis: Redis;
  readonly retention: Retention;

  constructor(opts: { redis: Redis; retention: Retention }) {
    this.redis = opts.redis;
    this.retention = {
      minutes: Math.max(1, Math.floor(opts.retention.minutes)),
      hours: Math.max(1, Math.floor(opts.retention.hours)),
      days: Math.max(1, Math.floor(opts.retention.days)),
    };
  }

  async upsertMinute(queue: string, metric: string, minute: number, value: number): Promise<void> {
    const day = minuteToDay(minute);
    await this.redis.eval(
      UPSERT_MINUTE,
      6,
      dayHashKey(queue, metric, day),
      hourHashKey(queue, metric, day),
      totalsHashKey(queue, metric),
      dayHashKey(GLOBAL_QUEUE, metric, day),
      hourHashKey(GLOBAL_QUEUE, metric, day),
      totalsHashKey(GLOBAL_QUEUE, metric),
      String(minute),
      String(minuteToHour(minute)),
      day,
      String(value),
      ttl(this.retention.minutes),
      ttl(this.retention.hours),
      ttl(this.retention.days),
      shiftDay(day, -this.retention.days)
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
    return this.readNumericHash(dayHashKey(queue, metric, day));
  }

  /**
   * Hourly buckets for one day, keyed by absolute hour index.
   *
   * Falls back to folding the minute hash when the hourly rollup is absent, which covers
   * days recorded before the rollup existed. Once those minute hashes age out, the days
   * they cover are already outside the minute window anyway.
   */
  async readDayHours(queue: string, metric: string, day: string): Promise<Record<string, number>> {
    const hours = await this.readNumericHash(hourHashKey(queue, metric, day));
    if (Object.keys(hours).length > 0) {
      return hours;
    }
    const minutes = await this.readDayMinutes(queue, metric, day);
    const folded: Record<string, number> = {};
    for (const field of Object.keys(minutes)) {
      const hour = String(minuteToHour(Number(field)));
      folded[hour] = (folded[hour] ?? 0) + minutes[field];
    }
    return folded;
  }

  private async readNumericHash(key: string): Promise<Record<string, number>> {
    const raw = await this.redis.hgetall(key);
    const out: Record<string, number> = {};
    for (const field of Object.keys(raw)) {
      out[field] = Number(raw[field]) || 0;
    }
    return out;
  }
}
