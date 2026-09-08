import type { BaseAdapter } from '@bull-board/api/baseAdapter';
import type { MetricsType } from '@bull-board/api/typings/app';
import { isCluster, resolveClient, type MetricsClient, type MetricsConnection } from './connection';
import { metricsToMinutePoints } from './dataMapping';
import { HistoryStore, type Retention } from './HistoryStore';
import { metricsKeys, resolveNamespace } from './keys';
import { LatencySampler } from './LatencySampler';
import { LatencyStore } from './LatencyStore';

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
  /**
   * A function is resolved on every tick, for a board whose queue set changes while it
   * runs. An array is read once, at construction.
   */
  queues: BaseAdapter[] | (() => BaseAdapter[]);
  connection: MetricsConnection;
  /**
   * Redis key namespace, defaulting to `bull-board:metrics`. Set it to separate two boards
   * sharing one Redis, and give the reading `RedisMetricsHistoryProvider` the same value.
   *
   * On a Redis Cluster the namespace has to sit in one hash slot, since the rollup scripts
   * write a queue's keys and the cross-queue keys in one EVAL. A prefix with no `{...}` hash
   * tag is wrapped in one, so `staging:metrics` becomes `{staging:metrics}`; supply your own
   * tag to choose the slot yourself.
   */
  prefix?: string;
  /** Per-resolution retention in days. Unspecified tiers fall back to the defaults. */
  retention?: Partial<Retention>;
  /**
   * Shorthand that sets the daily and hourly windows. Minute retention stays at its
   * default unless raised explicitly, since that is the tier that drives storage size.
   */
  retentionDays?: number;
  snapshotIntervalMs?: number;
  /**
   * Latency histograms and the queue-age gauge. On by default: the package exists to give
   * boards without a metrics stack something useful, and an opt-in feature is one nobody
   * finds. At default retention this costs roughly 250 to 300KB per queue under typical
   * traffic, up to about 575KB in a pathological worst case, plus a one-off shared cost of
   * roughly 224KB for the cross-queue rollup regardless of queue count.
   */
  latency?: boolean;
  /** Above this many finished jobs in one tick, the sampler subsamples. */
  maxLatencySamplesPerTick?: number;
  /**
   * Test-oriented escape hatch: overrides the sampler's default 5s safety margin (see
   * `LatencySampler`'s `SAFETY_MARGIN_MS`), which otherwise excludes jobs that finished
   * just before a scan. Lets a test read back a sample immediately instead of sleeping
   * past the margin.
   */
  latencySafetyMarginMs?: number;
  /**
   * Notified whenever a latency tick fails. Latency errors are swallowed on purpose so a
   * failing scan cannot take the counter snapshot with it, which also means a collector
   * broken since startup looks the same as a board with no traffic. Default stays silent;
   * wire this to your logger to tell an empty chart from a broken one.
   */
  onLatencyError?: (error: unknown, queueName: string) => void;
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
  private readonly resolveQueues: () => BaseAdapter[];
  private readonly store: HistoryStore;
  private readonly redis: MetricsClient;
  private readonly ownsRedis: boolean;
  private readonly intervalMs: number;
  private readonly lastMinute = new Map<string, number>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private stopped = false;
  readonly latencyEnabled: boolean;
  private readonly latencySampler: LatencySampler | null;

  constructor(opts: MetricsRecorderOptions) {
    const { queues } = opts;
    this.resolveQueues = typeof queues === 'function' ? queues : () => queues;
    this.intervalMs = opts.snapshotIntervalMs ?? 60000;
    const { client, owned } = resolveClient(opts.connection);
    this.redis = client;
    this.ownsRedis = owned;
    const keys = metricsKeys(resolveNamespace(opts.prefix, isCluster(client)));
    this.store = new HistoryStore({ redis: this.redis, keys, retention: resolveRetention(opts) });
    this.latencyEnabled = opts.latency !== false;
    this.latencySampler = this.latencyEnabled
      ? new LatencySampler({
          redis: this.redis,
          keys,
          store: new LatencyStore({ redis: this.redis, keys, retention: resolveRetention(opts) }),
          tickMs: this.intervalMs,
          maxSamplesPerTick: opts.maxLatencySamplesPerTick,
          safetyMarginMs: opts.latencySafetyMarginMs,
          onError: opts.onLatencyError,
        })
      : null;
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
    if (this.ownsRedis && !this.stopped) {
      this.redis.disconnect();
    }
    this.stopped = true;
  }

  async snapshot(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      for (const adapter of this.resolveQueues()) {
        const name = adapter.getName();
        for (const metric of METRICS) {
          await this.snapshotOne(adapter, name, metric);
        }
        if (this.latencySampler) {
          await this.latencySampler.sample(adapter);
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
