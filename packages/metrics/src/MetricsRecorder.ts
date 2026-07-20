import type { BaseAdapter } from '@bull-board/api/baseAdapter';
import type { MetricsType } from '@bull-board/api/typings/app';
import { Redis, type RedisOptions } from 'ioredis';
import { metricsToMinutePoints } from './dataMapping';
import { HistoryStore } from './HistoryStore';

const METRICS: MetricsType[] = ['completed', 'failed'];

export interface MetricsRecorderOptions {
  queues: BaseAdapter[];
  connection: RedisOptions | Redis;
  retentionDays?: number;
  snapshotIntervalMs?: number;
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
    this.store = new HistoryStore({ redis: this.redis, retentionDays: opts.retentionDays ?? 90 });
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

    let newest = seenUpTo;
    for (const point of points) {
      if (point.minute <= seenUpTo) {
        break; // points are newest-first; everything older is already stored
      }
      await this.store.upsertMinute(name, metric, point.minute, point.value);
      if (point.minute > newest) {
        newest = point.minute;
      }
    }
    this.lastMinute.set(cursorKey, newest);
  }
}
