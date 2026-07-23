import { Redis, type RedisOptions } from 'ioredis';
import { GLOBAL_QUEUE, HOUR_TIER, NAMESPACE, dayHashKey, hourHashKey, totalsHashKey } from './keys';

const SCAN_COUNT = 500;
const BATCH = 256;
/** Keys per pipelined `stats()` batch. Each key costs two commands. */
const MEASURE_BATCH = 250;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const METRICS = ['completed', 'failed'];

export interface TierStats {
  keys: number;
  /** Sum of `MEMORY USAGE` over this tier's keys, in bytes. */
  bytes: number;
}

export interface HistoryQueueStats {
  /** Queue name, or `__global__` for the cross-queue rollup. */
  queue: string;
  keys: number;
  bytes: number;
  /** Recorded minute buckets, the tier that drives storage size. */
  minutes: number;
  /** Days covered by a minute or hour hash, ascending. */
  days: string[];
  /** Where this queue's bytes actually sit, so a footprint can be diagnosed. */
  tiers: Record<HistoryTier, TierStats>;
}

export interface HistoryStats {
  keys: number;
  bytes: number;
  minutes: number;
  oldestDay: string | null;
  newestDay: string | null;
  tiers: Record<HistoryTier, TierStats>;
  queues: HistoryQueueStats[];
}

export interface PurgeOptions {
  /** Limit the purge to one queue. Omit to purge every queue plus the global rollup. */
  queue?: string;
  /** Only drop days strictly before this date (UTC). Omit to drop everything in scope. */
  before?: Date | string;
}

export interface PurgeResult {
  keysDeleted: number;
  /** Day fields removed from totals hashes. */
  fieldsDeleted: number;
}

export interface MetricsHistoryAdminOptions {
  connection: RedisOptions | Redis;
}

export type HistoryTier = 'minute' | 'hour' | 'day';

interface ParsedKey {
  queue: string;
  metric: string;
  tier: HistoryTier;
  /** ISO day the key covers, `null` for the daily totals hash. */
  day: string | null;
}

/**
 * Parses the three key shapes from the right, because queue names may themselves contain
 * colons:
 *
 *   <ns>:<queue>:<metric>:<day>         minute buckets
 *   <ns>:<queue>:<metric>:hour:<day>    hourly rollup
 *   <ns>:<queue>:<metric>:totals        daily totals
 *
 * The metric segment is checked against the known set, so a queue named `hour` or one
 * ending in `:completed` still resolves correctly. Anything that doesn't fit returns null
 * and is then reported but never deleted, so a stray key can't be destroyed by accident.
 */
export function parseHistoryKey(key: string): ParsedKey | null {
  const prefix = `${NAMESPACE}:`;
  if (!key.startsWith(prefix)) {
    return null;
  }
  const parts = key.slice(prefix.length).split(':');
  if (parts.length < 3) {
    return null;
  }
  const last = parts[parts.length - 1];

  if (last === 'totals' && METRICS.includes(parts[parts.length - 2])) {
    const queue = parts.slice(0, -2).join(':');
    return queue ? { queue, metric: parts[parts.length - 2], tier: 'day', day: null } : null;
  }
  if (!DAY_PATTERN.test(last)) {
    return null;
  }
  if (parts.length >= 4 && parts[parts.length - 2] === HOUR_TIER) {
    const metric = parts[parts.length - 3];
    const queue = parts.slice(0, -3).join(':');
    return queue && METRICS.includes(metric) ? { queue, metric, tier: 'hour', day: last } : null;
  }
  const metric = parts[parts.length - 2];
  const queue = parts.slice(0, -2).join(':');
  return queue && METRICS.includes(metric) ? { queue, metric, tier: 'minute', day: last } : null;
}

function emptyTiers(): Record<HistoryTier, TierStats> {
  return {
    minute: { keys: 0, bytes: 0 },
    hour: { keys: 0, bytes: 0 },
    day: { keys: 0, bytes: 0 },
  };
}

/** The global rollup key mirroring a per-queue key, same tier and same day. */
function globalKeyFor(parsed: ParsedKey): string {
  if (parsed.day === null) {
    return totalsHashKey(GLOBAL_QUEUE, parsed.metric);
  }
  return parsed.tier === 'hour'
    ? hourHashKey(GLOBAL_QUEUE, parsed.metric, parsed.day)
    : dayHashKey(GLOBAL_QUEUE, parsed.metric, parsed.day);
}

function toDay(value: Date | string): string {
  if (typeof value === 'string') {
    if (!DAY_PATTERN.test(value)) {
      throw new Error(`Expected a YYYY-MM-DD day or a Date, got "${value}"`);
    }
    return value;
  }
  return value.toISOString().slice(0, 10);
}

/**
 * Inspection and cleanup for the Redis keys written by `MetricsRecorder`.
 *
 * Every operation is confined to the `bull-board:metrics:` namespace and driven by SCAN,
 * so it never blocks Redis and never touches BullMQ's own keys. Deletes use UNLINK.
 */
export class MetricsHistoryAdmin {
  private readonly redis: Redis;
  private readonly ownsRedis: boolean;

  constructor(opts: MetricsHistoryAdminOptions) {
    if (opts.connection instanceof Redis) {
      this.redis = opts.connection;
      this.ownsRedis = false;
    } else {
      this.redis = new Redis(opts.connection);
      this.ownsRedis = true;
    }
  }

  disconnect(): void {
    if (this.ownsRedis) {
      this.redis.disconnect();
    }
  }

  /**
   * Per-queue footprint of the stored history.
   *
   * Every key has to be measured individually, since only `MEMORY USAGE` knows what a hash
   * really costs. Issuing those one at a time would mean a round trip per key, which at a
   * 90-day retention across a dozen queues runs into the thousands, so the measurements go
   * out in pipelined batches instead. Still an ops-scale call rather than a hot path: it
   * reads the whole namespace, so it belongs behind a debug endpoint, not a poll.
   */
  async stats(): Promise<HistoryStats> {
    const byQueue = new Map<string, HistoryQueueStats>();
    const tiers = emptyTiers();
    let keys = 0;
    let bytes = 0;
    let minutes = 0;
    let oldestDay: string | null = null;
    let newestDay: string | null = null;

    const found: { key: string; parsed: ParsedKey }[] = [];
    for await (const key of this.scan()) {
      const parsed = parseHistoryKey(key);
      if (parsed) {
        found.push({ key, parsed });
      }
    }
    const measurements = await this.measure(found.map((item) => item.key));

    for (const [index, { parsed }] of found.entries()) {
      const { size, len } = measurements[index];

      const entry = byQueue.get(parsed.queue) ?? {
        queue: parsed.queue,
        keys: 0,
        bytes: 0,
        minutes: 0,
        days: [],
        tiers: emptyTiers(),
      };
      entry.keys += 1;
      entry.bytes += size;
      entry.tiers[parsed.tier].keys += 1;
      entry.tiers[parsed.tier].bytes += size;
      keys += 1;
      bytes += size;
      tiers[parsed.tier].keys += 1;
      tiers[parsed.tier].bytes += size;

      if (parsed.tier === 'minute') {
        entry.minutes += len;
        minutes += len;
      }
      if (parsed.day) {
        entry.days.push(parsed.day);
        if (oldestDay === null || parsed.day < oldestDay) {
          oldestDay = parsed.day;
        }
        if (newestDay === null || parsed.day > newestDay) {
          newestDay = parsed.day;
        }
      }
      byQueue.set(parsed.queue, entry);
    }

    const queues = [...byQueue.values()].sort((a, b) => b.bytes - a.bytes);
    for (const queue of queues) {
      queue.days = [...new Set(queue.days)].sort();
    }
    return { keys, bytes, minutes, oldestDay, newestDay, tiers, queues };
  }

  /**
   * Size and entry count for each key, in pipelined batches so the cost is a handful of
   * round trips rather than one per key. A key that expires between the scan and the
   * measurement simply reads as zero rather than failing the whole call.
   */
  private async measure(keys: string[]): Promise<{ size: number; len: number }[]> {
    const out: { size: number; len: number }[] = [];
    for (let i = 0; i < keys.length; i += MEASURE_BATCH) {
      const chunk = keys.slice(i, i + MEASURE_BATCH);
      const pipeline = this.redis.pipeline();
      for (const key of chunk) {
        pipeline.memory('USAGE', key);
        pipeline.hlen(key);
      }
      const res = await pipeline.exec();
      for (let j = 0; j < chunk.length; j++) {
        out.push({
          size: Number(res?.[j * 2]?.[1] ?? 0) || 0,
          len: Number(res?.[j * 2 + 1]?.[1] ?? 0) || 0,
        });
      }
    }
    return out;
  }

  /**
   * Deletes recorded history. Purging a single queue also subtracts that queue's minutes
   * from the global rollup, so the cross-queue chart stays correct instead of keeping the
   * removed queue's throughput folded into it forever.
   */
  async purge(opts: PurgeOptions = {}): Promise<PurgeResult> {
    const before = opts.before === undefined ? null : toDay(opts.before);
    const result: PurgeResult = { keysDeleted: 0, fieldsDeleted: 0 };
    const dayKeys: { key: string; parsed: ParsedKey }[] = [];
    const totalsKeys: { key: string; parsed: ParsedKey }[] = [];

    for await (const key of this.scan()) {
      const parsed = parseHistoryKey(key);
      if (!parsed) {
        continue;
      }
      if (opts.queue !== undefined && parsed.queue !== opts.queue) {
        continue;
      }
      if (parsed.day === null) {
        totalsKeys.push({ key, parsed });
      } else if (before === null || parsed.day < before) {
        dayKeys.push({ key, parsed });
      }
    }

    // Rewriting the global rollup only makes sense when a single queue is being removed:
    // a full purge drops the global keys outright, along with everything else.
    const adjustGlobal = opts.queue !== undefined && opts.queue !== GLOBAL_QUEUE;

    for (const { key, parsed } of dayKeys) {
      if (adjustGlobal) {
        result.keysDeleted += await this.subtractDayFromGlobal(key, parsed);
      }
      result.keysDeleted += await this.redis.unlink(key);
    }

    for (const { key, parsed } of totalsKeys) {
      const stale = (await this.redis.hkeys(key)).filter((day) => before === null || day < before);
      if (adjustGlobal && stale.length > 0) {
        const totals = await this.redis.hmget(key, ...stale);
        result.fieldsDeleted += await this.subtractTotalsFromGlobal(parsed.metric, stale, totals);
      }
      if (before === null) {
        result.keysDeleted += await this.redis.unlink(key);
        continue;
      }
      for (let i = 0; i < stale.length; i += BATCH) {
        result.fieldsDeleted += await this.redis.hdel(key, ...stale.slice(i, i + BATCH));
      }
      if ((await this.redis.hlen(key)) === 0) {
        result.keysDeleted += await this.redis.unlink(key);
      }
    }

    return result;
  }

  /**
   * Removes one queue's buckets from the matching global key, so the cross-queue series
   * reflects the queues that are left rather than keeping the removed queue folded in.
   * Each tier is corrected from its own source key, because the tiers have independent
   * retention and the minute hash may already be gone while the hourly one survives.
   * Fields that drain to zero are dropped: the recorder never writes a zero bucket, so a
   * leftover zero would read as recorded-but-idle instead of not recorded.
   * Returns the number of global keys it deleted.
   */
  private async subtractDayFromGlobal(key: string, parsed: ParsedKey): Promise<number> {
    if (parsed.day === null) {
      return 0;
    }
    const minutes = await this.redis.hgetall(key);
    const globalDay = globalKeyFor(parsed);
    const pipeline = this.redis.multi();
    const touched: string[] = [];
    for (const field of Object.keys(minutes)) {
      const value = Number(minutes[field]) || 0;
      if (value === 0) {
        continue;
      }
      touched.push(field);
      pipeline.hincrby(globalDay, field, -value);
    }
    if (touched.length === 0) {
      return 0;
    }
    const res = await pipeline.exec();
    const drained = touched.filter((_, i) => Number(res?.[i]?.[1] ?? 0) <= 0);
    for (let i = 0; i < drained.length; i += BATCH) {
      await this.redis.hdel(globalDay, ...drained.slice(i, i + BATCH));
    }
    return (await this.redis.hlen(globalDay)) === 0 ? await this.redis.unlink(globalDay) : 0;
  }

  /**
   * Same idea for the daily rollup: the global totals hash is the sum of the per-queue
   * totals hashes, so it is corrected from those rather than re-derived from day hashes,
   * which may already have expired. Returns the number of global fields it removed.
   */
  private async subtractTotalsFromGlobal(
    metric: string,
    days: string[],
    values: (string | null)[]
  ): Promise<number> {
    const globalTotals = totalsHashKey(GLOBAL_QUEUE, metric);
    const pipeline = this.redis.multi();
    const touched: string[] = [];
    days.forEach((day, i) => {
      const value = Number(values[i]) || 0;
      if (value === 0) {
        return;
      }
      touched.push(day);
      pipeline.hincrby(globalTotals, day, -value);
    });
    if (touched.length === 0) {
      return 0;
    }
    const res = await pipeline.exec();
    const drained = touched.filter((_, i) => Number(res?.[i]?.[1] ?? 0) <= 0);
    let removed = 0;
    for (let i = 0; i < drained.length; i += BATCH) {
      removed += await this.redis.hdel(globalTotals, ...drained.slice(i, i + BATCH));
    }
    return removed;
  }

  /**
   * SCAN over the namespace. SCAN may hand back the same key on more than one cursor
   * iteration, which would double-count in `stats()`, so emissions are de-duped here.
   * The set is bounded by queues x metrics x retention days.
   */
  private async *scan(): AsyncGenerator<string> {
    const seen = new Set<string>();
    let cursor = '0';
    do {
      const [next, batch] = await this.redis.scan(
        cursor,
        'MATCH',
        `${NAMESPACE}:*`,
        'COUNT',
        SCAN_COUNT
      );
      cursor = next;
      for (const key of batch) {
        if (!seen.has(key)) {
          seen.add(key);
          yield key;
        }
      }
    } while (cursor !== '0');
  }
}
