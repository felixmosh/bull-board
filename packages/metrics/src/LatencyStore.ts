import type { Redis } from 'ioredis';
import { BUCKET_COUNT, mergeVectors, packVector, unpackVector } from './histogram';
import type { Retention } from './HistoryStore';
import { GLOBAL_QUEUE, hourHashKey, minuteToDay, shiftDay, totalsHashKey } from './keys';

export type LatencyMetric = 'runtime' | 'waittime';

export const QUEUE_AGE_METRIC = 'queueage';

const SECONDS_PER_DAY = 86400;
const MS_PER_HOUR = 3600000;

function ttl(days: number): string {
  return String(Math.max(1, Math.floor(days * SECONDS_PER_DAY)));
}

/**
 * Merges one tick's bucket vector into the queue's hour hash, its day totals, and the
 * global rollup of both, in a single round trip.
 *
 * Packing all 18 counts into one hash field rather than one field per bucket is what keeps
 * this affordable: Redis hash entry overhead dwarfs a two-byte count, so the packed form
 * costs roughly an eighth of the field-per-bucket form. The trade is that HINCRBY no longer
 * applies, hence the read-modify-write here.
 *
 * Unlike the counter path there is no delta trick, because the caller supplies increments
 * rather than absolute values. Two recorders writing the same tick would double-count, which
 * is what LatencySampler's lease prevents.
 *
 * KEYS[1] queue hour hash    ARGV[1] hour field      ARGV[4] hour-tier ttl
 * KEYS[2] queue totals hash  ARGV[2] day field        ARGV[5] day-tier ttl
 * KEYS[3] global hour hash   ARGV[3] packed vector    ARGV[6] oldest day to keep
 * KEYS[4] global totals hash                          ARGV[7] bucket count
 */
const MERGE_VECTOR = `
local function merge(key, field, incoming, width)
  local current = redis.call('HGET', key, field)
  local out = {}
  local i = 1
  if current then
    for value in string.gmatch(current, '([^,]+)') do
      out[i] = tonumber(value) or 0
      i = i + 1
    end
  end
  while i <= width do
    out[i] = 0
    i = i + 1
  end
  local j = 1
  for value in string.gmatch(incoming, '([^,]+)') do
    out[j] = (out[j] or 0) + (tonumber(value) or 0)
    j = j + 1
  end
  redis.call('HSET', key, field, table.concat(out, ','))
end

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

local width = tonumber(ARGV[7])
local newDay = redis.call('HEXISTS', KEYS[2], ARGV[2]) == 0

merge(KEYS[1], ARGV[1], ARGV[3], width)
merge(KEYS[2], ARGV[2], ARGV[3], width)
merge(KEYS[3], ARGV[1], ARGV[3], width)
merge(KEYS[4], ARGV[2], ARGV[3], width)

redis.call('EXPIRE', KEYS[1], ARGV[4])
redis.call('EXPIRE', KEYS[2], ARGV[5])
redis.call('EXPIRE', KEYS[3], ARGV[4])
redis.call('EXPIRE', KEYS[4], ARGV[5])

if newDay then
  trim(KEYS[2], ARGV[6])
  trim(KEYS[4], ARGV[6])
end
return 1
`;

/**
 * Queue age is a gauge, so an hour holds the worst backlog seen in it and a day holds the
 * worst of its hours. Summing would be meaningless.
 */
const MAX_GAUGE = `
local function setMax(key, field, value)
  local current = tonumber(redis.call('HGET', key, field) or '-1')
  if value > current then
    redis.call('HSET', key, field, value)
  end
end

local value = tonumber(ARGV[3])
setMax(KEYS[1], ARGV[1], value)
setMax(KEYS[2], ARGV[2], value)
redis.call('EXPIRE', KEYS[1], ARGV[4])
redis.call('EXPIRE', KEYS[2], ARGV[5])
return 1
`;

export class LatencyStore {
  private readonly redis: Redis;
  readonly retention: Retention;

  constructor(opts: { redis: Redis; retention: Retention }) {
    this.redis = opts.redis;
    this.retention = opts.retention;
  }

  async addSamples(
    queue: string,
    metric: LatencyMetric,
    hour: number,
    vector: number[]
  ): Promise<void> {
    const day = minuteToDay(hour * 60);
    await this.redis.eval(
      MERGE_VECTOR,
      4,
      hourHashKey(queue, metric, day),
      totalsHashKey(queue, metric),
      hourHashKey(GLOBAL_QUEUE, metric, day),
      totalsHashKey(GLOBAL_QUEUE, metric),
      String(hour),
      day,
      packVector(vector),
      ttl(this.retention.hours),
      ttl(this.retention.days),
      shiftDay(day, -this.retention.days),
      String(BUCKET_COUNT)
    );
  }

  async recordQueueAge(queue: string, hour: number, ms: number): Promise<void> {
    const day = minuteToDay(hour * 60);
    await this.redis.eval(
      MAX_GAUGE,
      2,
      hourHashKey(queue, QUEUE_AGE_METRIC, day),
      totalsHashKey(queue, QUEUE_AGE_METRIC),
      String(hour),
      day,
      String(Math.max(0, Math.round(ms))),
      ttl(this.retention.hours),
      ttl(this.retention.days)
    );
  }

  async readRange(
    queue: string,
    metric: LatencyMetric,
    granularity: 'hour' | 'day',
    days: string[]
  ): Promise<Record<string, number[]>> {
    const out: Record<string, number[]> = {};
    if (granularity === 'day') {
      const raw = await this.redis.hgetall(totalsHashKey(queue, metric));
      for (const day of days) {
        if (raw[day] !== undefined) {
          out[day] = unpackVector(raw[day]);
        }
      }
      return out;
    }
    for (const day of days) {
      const raw = await this.redis.hgetall(hourHashKey(queue, metric, day));
      for (const field of Object.keys(raw)) {
        out[field] = out[field]
          ? mergeVectors(out[field], unpackVector(raw[field]))
          : unpackVector(raw[field]);
      }
    }
    return out;
  }

  async readQueueAge(
    queue: string,
    granularity: 'hour' | 'day',
    days: string[]
  ): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    if (granularity === 'day') {
      const raw = await this.redis.hgetall(totalsHashKey(queue, QUEUE_AGE_METRIC));
      for (const day of days) {
        if (raw[day] !== undefined) {
          out[day] = Number(raw[day]) || 0;
        }
      }
      return out;
    }
    for (const day of days) {
      const raw = await this.redis.hgetall(hourHashKey(queue, QUEUE_AGE_METRIC, day));
      for (const field of Object.keys(raw)) {
        out[field] = Math.max(out[field] ?? 0, Number(raw[field]) || 0);
      }
    }
    return out;
  }

  /** Epoch ms for an absolute hour index, for building response timestamps. */
  static hourToMs(hour: number): number {
    return hour * MS_PER_HOUR;
  }
}
