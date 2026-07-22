import type {
  MetricsHistoryPoint,
  MetricsHistoryProvider,
  MetricsHistoryQuery,
} from '@bull-board/api/typings/app';
import { Redis, type RedisOptions } from 'ioredis';
import {
  MetricsHistoryAdmin,
  type HistoryStats,
  type PurgeOptions,
  type PurgeResult,
} from './HistoryAdmin';
import { HistoryStore, type Retention } from './HistoryStore';
import { GLOBAL_QUEUE, dayRange, dayToStartMs } from './keys';
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
}

function dayFloor(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
