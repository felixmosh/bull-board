import type { BaseAdapter } from '@bull-board/api/baseAdapter';
import type { MetricsType } from '@bull-board/api/typings/app';
import { Redis, type RedisOptions } from 'ioredis';
import { metricsToMinutePoints } from './dataMapping';
import { HistoryStore, type Retention } from './HistoryStore';

const METRICS: MetricsType[] = ['completed', 'failed'];
const MS_PER_MINUTE = 60000;
const MINUTES_PER_DAY = 1440;

/**
 * Minute detail is the expensive tier by two orders of magnitude, so it defaults to a week
 * rather than the full window: long enough to match the recommended `MetricsTime.ONE_WEEK`
 * worker buffer, so the recorder can be down for a week and still catch up completely.
 * The hourly and daily rollups are cheap enough to keep for the whole window.
 */
export const DEFAULT_RETENTION: Retention = { minutes: 7, hours: 90, days: 90 };

export interface MetricsRecorderOptions {
  queues: BaseAdapter[];
  connection: RedisOptions | Redis;
  /** Per-resolution retention in days. Unspecified tiers fall back to the defaults. */
  retention?: Partial<Retention>;
  /**
   * Shorthand that sets the daily and hourly windows. Minute retention stays at its
   * default unless raised explicitly, since that is the tier that drives storage size.
   */
  retentionDays?: number;
  snapshotIntervalMs?: number;
}

export function resolveRetention(opts: {
  retention?: Partial<Retention>;
  retentionDays?: number;
}): Retention {
  const base =
    opts.retentionDays === undefined
      ? DEFAULT_RETENTION
      : {
          minutes: Math.min(DEFAULT_RETENTION.minutes, opts.retentionDays),
          hours: opts.retentionDays,
          days: opts.retentionDays,
        };
  return { ...base, ...opts.retention };
}

export class MetricsRecorder {
  private readonly queues: BaseAdapter[];
  private readonly store: HistoryStore;
  private readonly redis: Redis;
  private readonly ownsRedis: boolean;
  private readonly intervalMs: number;
  private readonly lastMinute = new Map<string, number>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(opts: MetricsRecorderOptions) {
    this.queues = opts.queues;
    this.intervalMs = opts.snapshotIntervalMs ?? 60000;
    if (opts.connection instanceof Redis) {
      this.redis = opts.connection;
      this.ownsRedis = false;
    } else {
      this.redis = new Redis(opts.connection);
      this.ownsRedis = true;
    }
    this.store = new HistoryStore({ redis: this.redis, retention: resolveRetention(opts) });
  }

  get retention(): Retention {
    return this.store.retention;
  }

  start(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.snapshot();
    }, this.intervalMs);
    // Do not keep the event loop alive solely for the recorder.
    if (typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
    void this.snapshot();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.ownsRedis) {
      this.redis.disconnect();
    }
  }

  async snapshot(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      for (const adapter of this.queues) {
        const name = adapter.getName();
        for (const metric of METRICS) {
          await this.snapshotOne(adapter, name, metric);
        }
      }
    } finally {
      this.running = false;
    }
  }

  /**
   * Incrementally copies BullMQ's per-minute ring buffer into long-retention storage.
   * `seenUpTo` is a per-(queue, metric) watermark of the newest minute already written.
   * getMetrics() returns points newest-first, so we walk from the newest and stop at the
   * first minute we've already stored: everything past it is older and stored too. Fresh
   * minutes are upserted (safe against overlapping windows across ticks), then the
   * watermark advances. So the first tick backfills the buffer and every later tick only
   * writes the minutes that appeared since.
   */
  private async snapshotOne(
    adapter: BaseAdapter,
    name: string,
    metric: MetricsType
  ): Promise<void> {
    const cursorKey = `${name}:${metric}`;
    const seenUpTo = this.lastMinute.get(cursorKey) ?? -1;

    const metrics = await adapter.getMetrics(metric).catch(() => null);
    const points = metricsToMinutePoints(metrics);
    if (points.length === 0) {
      return;
    }

    // Correctness guard, not an optimization. Idempotency comes from the minute hash
    // holding the previously written value, so a minute whose hash has already expired
    // would look brand new and be added to the hourly and daily rollups a second time.
    // That can only happen when the worker's metrics buffer reaches further back than the
    // minute window (say a two-week buffer against a one-week window) and the recorder
    // restarts, losing its in-memory watermark. Refusing to write past the window closes
    // it. Nothing is lost that could have been retained anyway.
    const oldestWritable =
      Math.floor(Date.now() / MS_PER_MINUTE) - this.store.retention.minutes * MINUTES_PER_DAY;

    let newest = seenUpTo;
    for (const point of points) {
      if (point.minute <= seenUpTo) {
        break; // points are newest-first; everything older is already stored
      }
      if (point.minute < oldestWritable) {
        break; // ...and everything past here is older still
      }
      await this.store.upsertMinute(name, metric, point.minute, point.value);
      if (point.minute > newest) {
        newest = point.minute;
      }
    }
    this.lastMinute.set(cursorKey, newest);
  }
}
