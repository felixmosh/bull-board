import type { MetricsClient } from './connection';
import { BUCKET_COUNT, mergeVectors, packVector, unpackVector } from './histogram';
import type { Retention } from './HistoryStore';
import { GLOBAL_QUEUE, minuteToDay, shiftDay, type MetricsKeys } from './keys';
import { runScript } from './scripts';

export type LatencyMetric = 'runtime' | 'waittime';

export const QUEUE_AGE_METRIC = 'queueage';

export interface LatencySamples {
  metric: LatencyMetric;
  hour: number;
  vector: number[];
}

const SECONDS_PER_DAY = 86400;
const MS_PER_HOUR = 3600000;

function ttl(days: number): string {
  return String(Math.max(1, Math.floor(days * SECONDS_PER_DAY)));
}

/**
 * Merges one tick's bucket vectors into the queue's hour hash, its day totals, and the
 * global rollup of both, in a single round trip.
 *
 * Packing all 18 counts into one hash field rather than one field per bucket is what keeps
 * this affordable: Redis hash entry overhead dwarfs a two-byte count, so the packed form
 * costs roughly an eighth of the field-per-bucket form. The trade is that HINCRBY no longer
 * applies, hence the read-modify-write here.
 *
 * Unlike the counter path there is no delta trick, because the caller supplies increments
 * rather than absolute values, so a window commits only alongside the watermark it began at.
 */
const MERGE_VECTORS = `
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

local guarded = ARGV[1] == '1'
if guarded and (redis.call('GET', KEYS[1]) or '') ~= ARGV[2] then
  return 0
end
for k = 2, #KEYS do
  local kind = redis.call('TYPE', KEYS[k]).ok
  if kind ~= 'hash' and kind ~= 'none' then
    return redis.error_reply('WRONGTYPE ' .. KEYS[k] .. ' is not a hash')
  end
end

local width = tonumber(ARGV[7])
for k = 2, #KEYS, 4 do
  local a = 8 + (k - 2)
  local hour, day, vector, cutoff = ARGV[a], ARGV[a + 1], ARGV[a + 2], ARGV[a + 3]
  local newDay = redis.call('HEXISTS', KEYS[k + 1], day) == 0
  merge(KEYS[k], hour, vector, width)
  merge(KEYS[k + 1], day, vector, width)
  merge(KEYS[k + 2], hour, vector, width)
  merge(KEYS[k + 3], day, vector, width)
  redis.call('EXPIRE', KEYS[k], ARGV[5])
  redis.call('EXPIRE', KEYS[k + 1], ARGV[6])
  redis.call('EXPIRE', KEYS[k + 2], ARGV[5])
  redis.call('EXPIRE', KEYS[k + 3], ARGV[6])
  if newDay then
    trim(KEYS[k + 1], cutoff)
    trim(KEYS[k + 3], cutoff)
  end
end
if guarded then
  redis.call('SET', KEYS[1], ARGV[3], 'EX', ARGV[4])
end
return 1
`;

/**
 * Queue age is a gauge, so an hour holds the worst backlog seen in it and a day holds the
 * worst of its hours. Summing would be meaningless -- which is also why the global rollup
 * here is a MAX across queues rather than the four-key SUM MERGE_VECTOR does: "the oldest
 * job waiting anywhere on this board" is the meaningful cross-queue number, adding queues'
 * ages together would not be.
 *
 * Because it's "set if greater", a bucket's value never goes down within its own hour or
 * day once a high value lands -- that's the correct meaning of "the worst backlog seen in
 * this hour/day", both for a single queue and for the global rollup. A later, healthier
 * queue doesn't erase an earlier spike from the same bucket; it only wins the buckets it
 * writes to itself.
 *
 * The totals hashes need the same day cutoff MERGE_VECTOR applies: their TTL is refreshed on
 * every tick, so without a trim they would accumulate one field per day for as long as the
 * queue exists rather than for the retention window.
 *
 * KEYS[1] queue hour hash    ARGV[1] hour field      ARGV[4] hour-tier ttl
 * KEYS[2] queue totals hash  ARGV[2] day field        ARGV[5] day-tier ttl
 * KEYS[3] global hour hash   ARGV[3] value            ARGV[6] oldest day to keep
 * KEYS[4] global totals hash
 */
const MAX_GAUGE = `
local function setMax(key, field, value)
  local current = tonumber(redis.call('HGET', key, field) or '-1')
  if value > current then
    redis.call('HSET', key, field, value)
  end
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

local value = tonumber(ARGV[3])
local newDay = redis.call('HEXISTS', KEYS[2], ARGV[2]) == 0

setMax(KEYS[1], ARGV[1], value)
setMax(KEYS[2], ARGV[2], value)
setMax(KEYS[3], ARGV[1], value)
setMax(KEYS[4], ARGV[2], value)

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

export class LatencyStore {
  private readonly redis: MetricsClient;
  private readonly keys: MetricsKeys;
  readonly retention: Retention;

  constructor(opts: { redis: MetricsClient; keys: MetricsKeys; retention: Retention }) {
    this.redis = opts.redis;
    this.keys = opts.keys;
    this.retention = opts.retention;
  }

  async addSamples(
    queue: string,
    metric: LatencyMetric,
    hour: number,
    vector: number[]
  ): Promise<void> {
    await this.merge(queue, [{ metric, hour, vector }], null);
  }

  async commitWindow(
    queue: string,
    samples: LatencySamples[],
    window: { from: string | null; to: number }
  ): Promise<void> {
    await this.merge(queue, samples, window);
  }

  private async merge(
    queue: string,
    samples: LatencySamples[],
    window: { from: string | null; to: number } | null
  ): Promise<void> {
    const keys: string[] = [];
    const args: string[] = [];
    for (const { metric, hour, vector } of samples) {
      const day = minuteToDay(hour * 60);
      keys.push(
        this.keys.hour(queue, metric, day),
        this.keys.totals(queue, metric),
        this.keys.hour(GLOBAL_QUEUE, metric, day),
        this.keys.totals(GLOBAL_QUEUE, metric)
      );
      args.push(String(hour), day, packVector(vector), shiftDay(day, -this.retention.days));
    }
    await runScript(
      this.redis,
      MERGE_VECTORS,
      keys.length + 1,
      this.keys.watermark(queue),
      ...keys,
      window ? '1' : '0',
      window?.from ?? '',
      String(window?.to ?? ''),
      ttl(this.retention.days),
      ttl(this.retention.hours),
      ttl(this.retention.days),
      String(BUCKET_COUNT),
      ...args
    );
  }

  async recordQueueAge(queue: string, hour: number, ms: number): Promise<void> {
    const day = minuteToDay(hour * 60);
    await runScript(
      this.redis,
      MAX_GAUGE,
      4,
      this.keys.hour(queue, QUEUE_AGE_METRIC, day),
      this.keys.totals(queue, QUEUE_AGE_METRIC),
      this.keys.hour(GLOBAL_QUEUE, QUEUE_AGE_METRIC, day),
      this.keys.totals(GLOBAL_QUEUE, QUEUE_AGE_METRIC),
      String(hour),
      day,
      String(Math.max(0, Math.round(ms))),
      ttl(this.retention.hours),
      ttl(this.retention.days),
      shiftDay(day, -this.retention.days)
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
      const raw = await this.redis.hgetall(this.keys.totals(queue, metric));
      for (const day of days) {
        if (raw[day] !== undefined) {
          out[day] = unpackVector(raw[day]);
        }
      }
      return out;
    }
    // Up to one key per retention day, so these go out together rather than as a serial
    // chain of round trips, matching how the counter path reads its day hashes.
    const perDay = await Promise.all(
      days.map((day) => this.redis.hgetall(this.keys.hour(queue, metric, day)))
    );
    for (const raw of perDay) {
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
      const raw = await this.redis.hgetall(this.keys.totals(queue, QUEUE_AGE_METRIC));
      for (const day of days) {
        if (raw[day] !== undefined) {
          out[day] = Number(raw[day]) || 0;
        }
      }
      return out;
    }
    const perDay = await Promise.all(
      days.map((day) => this.redis.hgetall(this.keys.hour(queue, QUEUE_AGE_METRIC, day)))
    );
    for (const raw of perDay) {
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
