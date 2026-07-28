import type {
  MetricsHistoryPoint,
  MetricsHistoryProvider,
  MetricsHistoryQuery,
  MetricsLatencyPoint,
  MetricsLatencyQuery,
} from '@bull-board/api/typings/app';
import { Redis, type RedisOptions } from 'ioredis';
import { quantile, vectorTotal } from './histogram';
import {
  MetricsHistoryAdmin,
  type HistoryStats,
  type PurgeOptions,
  type PurgeResult,
} from './HistoryAdmin';
import { HistoryStore, type Retention } from './HistoryStore';
import { GLOBAL_QUEUE, dayRange, dayToStartMs } from './keys';
import { LatencyStore } from './LatencyStore';
import { resolveRetention } from './MetricsRecorder';

const MS_PER_HOUR = 3600000;

export interface RedisMetricsHistoryProviderOptions {
  connection: RedisOptions | Redis;
  /** Should mirror the recorder's retention. Only used to bound the query span. */
  retention?: Partial<Retention>;
  retentionDays?: number;
}

export class RedisMetricsHistoryProvider implements MetricsHistoryProvider {
  private readonly store: HistoryStore;
  private readonly latencyStore: LatencyStore;
  private readonly admin: MetricsHistoryAdmin;
  private readonly redis: Redis;
  private readonly ownsRedis: boolean;
  private readonly retentionDays: number;

  constructor(opts: RedisMetricsHistoryProviderOptions) {
    if (opts.connection instanceof Redis) {
      this.redis = opts.connection;
      this.ownsRedis = false;
    } else {
      this.redis = new Redis(opts.connection);
      this.ownsRedis = true;
    }
    const retention = resolveRetention(opts);
    this.retentionDays = retention.days;
    this.store = new HistoryStore({ redis: this.redis, retention });
    this.latencyStore = new LatencyStore({ redis: this.redis, retention });
    this.admin = new MetricsHistoryAdmin({ connection: this.redis });
  }

  disconnect(): void {
    if (this.ownsRedis) {
      this.redis.disconnect();
    }
  }

  /** Backs the board's storage panel. See MetricsHistoryAdmin.stats. */
  async getUsage(): Promise<HistoryStats> {
    return this.admin.stats();
  }

  /** Backs the board's "clear history" action. See MetricsHistoryAdmin.purge. */
  async purge(options: PurgeOptions = {}): Promise<PurgeResult> {
    return this.admin.purge(options);
  }

  async getHistory(query: MetricsHistoryQuery): Promise<MetricsHistoryPoint[]> {
    const queue = query.queue ?? GLOBAL_QUEUE;
    // Clamp the span to the retention window so an unbounded `from` (e.g. 0) can't make
    // dayRange produce an unbounded number of day buckets -- older data doesn't exist anyway.
    const maxSpanMs = (this.retentionDays + 1) * 86400000;
    const from = Math.max(query.from, query.to - maxSpanMs);
    const days = dayRange(from, query.to);

    if (query.metric === 'queueage') {
      const ages = await this.latencyStore.readQueueAge(queue, query.granularity, days);
      // Day points are stamped at the day's start, so an intraday `from` would drop the day
      // it falls in. Floored, exactly as the counter path below does it.
      const lowerBound = query.granularity === 'day' ? dayFloor(query.from) : query.from;
      return Object.keys(ages)
        .map((key) => ({
          ts: query.granularity === 'day' ? dayToStartMs(key) : Number(key) * MS_PER_HOUR,
          value: ages[key],
        }))
        .filter((p) => p.ts >= lowerBound && p.ts <= query.to)
        .sort((a, b) => a.ts - b.ts);
    }

    if (query.granularity === 'day') {
      const rawTotals = await this.store.readDailyTotalsRaw(queue, query.metric, days);
      // Empty history only when no day in range was ever recorded (all fields missing).
      // A day with a stored '0' still counts as recorded -- otherwise the UI's empty
      // state would be unreachable once any data exists.
      if (rawTotals.every((value) => value == null)) {
        return [];
      }
      const totals: Record<string, number> = {};
      days.forEach((day, i) => {
        totals[day] = Number(rawTotals[i]) || 0;
      });
      return days
        .map((day) => ({ ts: dayToStartMs(day), value: totals[day] ?? 0 }))
        .filter((p) => p.ts >= dayFloor(query.from) && p.ts <= query.to);
    }

    const hourBuckets = new Map<number, number>();
    const dayHours = await Promise.all(
      days.map((day) => this.store.readDayHours(queue, query.metric, day))
    );
    for (const hours of dayHours) {
      for (const field of Object.keys(hours)) {
        const ts = Number(field) * MS_PER_HOUR;
        if (ts < query.from || ts > query.to) {
          continue;
        }
        hourBuckets.set(ts, (hourBuckets.get(ts) ?? 0) + hours[field]);
      }
    }
    return [...hourBuckets.entries()]
      .map(([ts, value]) => ({ ts, value }))
      .sort((a, b) => a.ts - b.ts);
  }

  async getLatency(query: MetricsLatencyQuery): Promise<MetricsLatencyPoint[]> {
    const queue = query.queue ?? GLOBAL_QUEUE;
    const maxSpanMs = (this.retentionDays + 1) * 86400000;
    const from = Math.max(query.from, query.to - maxSpanMs);
    const days = dayRange(from, query.to);

    const raw = await this.latencyStore.readRange(queue, query.metric, query.granularity, days);
    // Same day-start alignment as getHistory: comparing a day bucket against a raw `from`
    // would drop the oldest day and leave this chart one bucket shorter than the throughput
    // chart drawn for the same range.
    const lowerBound = query.granularity === 'day' ? dayFloor(query.from) : query.from;

    const points: MetricsLatencyPoint[] = [];
    for (const key of Object.keys(raw)) {
      const ts = query.granularity === 'day' ? dayToStartMs(key) : Number(key) * MS_PER_HOUR;
      if (ts < lowerBound || ts > query.to) {
        continue;
      }
      const vector = raw[key];
      const count = vectorTotal(vector);
      if (count === 0) {
        continue;
      }
      const values: Record<string, number> = {};
      for (const p of query.percentiles) {
        values[String(p)] = quantile(vector, p);
      }
      points.push({ ts, count: Math.round(count), values });
    }
    return points.sort((a, b) => a.ts - b.ts);
  }
}

function dayFloor(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
