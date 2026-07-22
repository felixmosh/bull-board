import { Redis, type RedisOptions } from 'ioredis';
import { GLOBAL_QUEUE, NAMESPACE, dayHashKey, totalsHashKey } from './keys';

const SCAN_COUNT = 500;
const BATCH = 256;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface HistoryQueueStats {
  /** Queue name, or `__global__` for the cross-queue rollup. */
  queue: string;
  /** Redis keys held for this queue (day hashes plus the totals hash). */
  keys: number;
  /** Sum of `MEMORY USAGE` over those keys, in bytes. */
  bytes: number;
  /** Recorded minute buckets across all day hashes. */
  minutes: number;
  /** Days that have a day hash, ascending. Empty when only totals survive. */
  days: string[];
}

export interface HistoryStats {
  keys: number;
  bytes: number;
  minutes: number;
  oldestDay: string | null;
  newestDay: string | null;
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

interface ParsedKey {
  queue: string;
  metric: string;
  /** ISO day for a day hash, `null` for a totals hash. */
  day: string | null;
}

/**
 * Parses `bull-board:metrics:<queue>:<metric>:<day|totals>` from the right, because queue
 * names may themselves contain colons. Returns null for anything that doesn't fit the
 * layout, so a stray key in the namespace is reported and never deleted by accident.
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
  const metric = parts[parts.length - 2];
  const queue = parts.slice(0, -2).join(':');
  if (!queue || !metric) {
    return null;
  }
  if (last === 'totals') {
    return { queue, metric, day: null };
  }
  return DAY_PATTERN.test(last) ? { queue, metric, day: last } : null;
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
   * Per-queue footprint of the stored history. Costs one `MEMORY USAGE` and one `HLEN` per
   * key, so it is meant for a debug endpoint or an ops script, not a hot path.
   */
  async stats(): Promise<HistoryStats> {
    const byQueue = new Map<string, HistoryQueueStats>();
    let keys = 0;
    let bytes = 0;
    let minutes = 0;
    let oldestDay: string | null = null;
    let newestDay: string | null = null;

    for await (const key of this.scan()) {
      const parsed = parseHistoryKey(key);
      if (!parsed) {
        continue;
      }
      const [size, len] = await this.redis
        .multi()
        .memory('USAGE', key)
        .hlen(key)
        .exec()
        .then((res) => [Number(res?.[0]?.[1] ?? 0), Number(res?.[1]?.[1] ?? 0)]);

      const entry = byQueue.get(parsed.queue) ?? {
        queue: parsed.queue,
        keys: 0,
        bytes: 0,
        minutes: 0,
        days: [],
      };
      entry.keys += 1;
      entry.bytes += size;
      keys += 1;
      bytes += size;

      if (parsed.day) {
        entry.minutes += len;
        minutes += len;
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
    return { keys, bytes, minutes, oldestDay, newestDay, queues };
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
   * Removes one queue's minutes from the global day hash, so the cross-queue series
   * reflects the queues that are left rather than keeping the removed queue folded in.
   * Fields that drain to zero are dropped: the recorder never writes a zero minute, so a
   * leftover zero would read as recorded-but-idle instead of not recorded.
   * Returns the number of global keys it deleted.
   */
  private async subtractDayFromGlobal(key: string, parsed: ParsedKey): Promise<number> {
    if (parsed.day === null) {
      return 0;
    }
    const minutes = await this.redis.hgetall(key);
    const globalDay = dayHashKey(GLOBAL_QUEUE, parsed.metric, parsed.day);
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
