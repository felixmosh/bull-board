import type {
  MetricsHistoryPoint,
  MetricsHistoryProvider,
  MetricsHistoryPurgeOptions,
  MetricsHistoryPurgeResult,
  MetricsHistoryQuery,
  MetricsHistoryQueueUsage,
  MetricsHistoryTierUsage,
  MetricsHistoryUsage,
  MetricsType,
} from '@bull-board/api/typings/app';
import { hashStr, mulberry32 } from './prng';
import { state } from './state';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const TAU = Math.PI * 2;

/** Matches @bull-board/metrics defaults: hour/day tiers keep 90 days, minutes keep 7. */
const RETENTION_DAYS = 90;
const MINUTE_RETENTION_DAYS = 7;

/** Same sentinel the real provider uses for the cross-queue rollup. */
const GLOBAL_QUEUE = '__global__';
const METRICS: MetricsType[] = ['completed', 'failed'];

// Byte costs per recorded bucket, taken from the storage table in the
// @bull-board/metrics README so the demo's storage panel shows realistic numbers.
const BYTES_PER_MINUTE_BUCKET = 50;
const BYTES_PER_HOUR_BUCKET = 13;
const BYTES_PER_DAY_FIELD = 15;

/** Hour bucket start (epoch ms, UTC-aligned) -> value. */
type Series = Map<number, number>;
type QueueSeries = Record<MetricsType, Series>;

const alignHour = (ms: number) => Math.floor(ms / HOUR_MS) * HOUR_MS;
const alignDay = (ms: number) => Math.floor(ms / DAY_MS) * DAY_MS;
const toIsoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * A queue's baseline throughput per hour, derived from how many jobs it holds so the
 * history table ranks queues the same way the dashboard does.
 */
function hourlyBaseline(jobCount: number): number {
  return Math.max(4, Math.round(jobCount / 2.5));
}

/**
 * Synthesises 90 days of hourly throughput for one queue: a daily curve peaking in the
 * afternoon, quieter weekends, a mild upward trend towards today, and rare hours where
 * failures spike the way a real incident would.
 */
function buildQueueSeries(queueName: string, baseline: number, endHour: number): QueueSeries {
  const completed: Series = new Map();
  const failed: Series = new Map();
  const totalHours = RETENTION_DAYS * 24;
  const nowFraction = (Date.now() - endHour) / HOUR_MS;

  for (let i = 0; i < totalHours; i++) {
    const hourStart = endHour - i * HOUR_MS;
    const rand = mulberry32(hashStr(`${queueName}:${hourStart}`));
    const date = new Date(hourStart);

    const diurnal = 0.55 + 0.45 * Math.sin(((date.getUTCHours() - 8) / 24) * TAU);
    const dayOfWeek = date.getUTCDay();
    const weekly = dayOfWeek === 0 || dayOfWeek === 6 ? 0.55 : 1;
    const trend = 1 + 0.3 * (1 - i / totalHours);
    const noise = 0.75 + rand() * 0.5;
    // The newest bucket is the hour we're in, so it is only partially filled.
    const elapsed = i === 0 ? Math.max(0.05, nowFraction) : 1;

    const completedValue = Math.round(baseline * diurnal * weekly * trend * noise * elapsed);
    if (completedValue <= 0) {
      continue;
    }
    completed.set(hourStart, completedValue);

    const isIncident = rand() > 0.985;
    const failureRate = isIncident ? 0.18 + rand() * 0.2 : 0.005 + rand() * 0.02;
    const failedValue = Math.round(completedValue * failureRate);
    if (failedValue > 0) {
      failed.set(hourStart, failedValue);
    }
  }

  return { completed, failed };
}

function emptyTiers(): Record<'minute' | 'hour' | 'day', MetricsHistoryTierUsage> {
  return {
    minute: { keys: 0, bytes: 0 },
    hour: { keys: 0, bytes: 0 },
    day: { keys: 0, bytes: 0 },
  };
}

function addTiers(
  target: Record<'minute' | 'hour' | 'day', MetricsHistoryTierUsage>,
  source: Record<'minute' | 'hour' | 'day', MetricsHistoryTierUsage>
): void {
  for (const tier of ['minute', 'hour', 'day'] as const) {
    target[tier].keys += source[tier].keys;
    target[tier].bytes += source[tier].bytes;
  }
}

/**
 * In-memory stand-in for `RedisMetricsHistoryProvider` from @bull-board/metrics.
 *
 * The demo has no Redis and no recorder, so the history the real package would have
 * collected over 90 days is generated once at startup and then served, purged and
 * measured like stored data. Everything lives in the page, so a reload brings it back.
 */
export class MockMetricsHistoryProvider implements MetricsHistoryProvider {
  private readonly store = new Map<string, QueueSeries>();

  constructor() {
    const endHour = alignHour(Date.now());
    const global: QueueSeries = { completed: new Map(), failed: new Map() };

    for (const queue of state.queues) {
      const series = buildQueueSeries(queue.name, hourlyBaseline(queue.jobs.length), endHour);
      this.store.set(queue.name, series);

      for (const metric of METRICS) {
        for (const [hourStart, value] of series[metric]) {
          global[metric].set(hourStart, (global[metric].get(hourStart) ?? 0) + value);
        }
      }
    }

    this.store.set(GLOBAL_QUEUE, global);
  }

  async getHistory({
    queue,
    metric,
    from,
    to,
    granularity,
  }: MetricsHistoryQuery): Promise<MetricsHistoryPoint[]> {
    const series = this.store.get(queue ?? GLOBAL_QUEUE)?.[metric];
    if (!series) {
      return [];
    }

    // The real provider reads whole buckets, so a range starting mid-day still returns
    // that day in full rather than a clipped first point.
    const start = granularity === 'hour' ? alignHour(from) : alignDay(from);
    const buckets = new Map<number, number>();

    for (const [hourStart, value] of series) {
      const bucket = granularity === 'hour' ? hourStart : alignDay(hourStart);
      if (bucket < start || bucket > to) {
        continue;
      }
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + value);
    }

    return [...buckets.entries()]
      .filter(([, value]) => value > 0)
      .map(([ts, value]) => ({ ts, value }))
      .sort((a, b) => a.ts - b.ts);
  }

  async getUsage(): Promise<MetricsHistoryUsage> {
    const minuteCutoff = Date.now() - MINUTE_RETENTION_DAYS * DAY_MS;
    const totals = emptyTiers();
    const queues: MetricsHistoryQueueUsage[] = [];
    let keys = 0;
    let bytes = 0;
    let minutes = 0;
    const dayBounds: string[] = [];

    for (const [queueName, series] of this.store) {
      const tiers = emptyTiers();
      const days = new Set<string>();
      let queueMinutes = 0;

      for (const metric of METRICS) {
        const measured = measureSeries(series[metric], minuteCutoff);
        addTiers(tiers, measured.tiers);
        queueMinutes += measured.minutes;
        for (const day of measured.days) {
          days.add(day);
        }
      }

      const queueKeys = tiers.minute.keys + tiers.hour.keys + tiers.day.keys;
      const queueBytes = tiers.minute.bytes + tiers.hour.bytes + tiers.day.bytes;
      const sortedDays = [...days].sort();

      queues.push({
        queue: queueName,
        keys: queueKeys,
        bytes: queueBytes,
        minutes: queueMinutes,
        days: sortedDays,
        tiers,
      });

      addTiers(totals, tiers);
      keys += queueKeys;
      bytes += queueBytes;
      minutes += queueMinutes;

      if (sortedDays.length > 0) {
        dayBounds.push(sortedDays[0], sortedDays[sortedDays.length - 1]);
      }
    }

    queues.sort((a, b) => b.bytes - a.bytes);
    dayBounds.sort();

    return {
      keys,
      bytes,
      minutes,
      oldestDay: dayBounds[0] ?? null,
      newestDay: dayBounds[dayBounds.length - 1] ?? null,
      tiers: totals,
      queues,
    };
  }

  async purge({ queue, before }: MetricsHistoryPurgeOptions): Promise<MetricsHistoryPurgeResult> {
    const cutoff = before ? Date.parse(`${before}T00:00:00Z`) : Number.POSITIVE_INFINITY;
    // The rollup is trimmed first, while the queue's own buckets are still there to
    // subtract from it.
    const targets = queue ? [GLOBAL_QUEUE, queue] : [...this.store.keys()];
    let keysDeleted = 0;
    let fieldsDeleted = 0;

    for (const name of targets) {
      const series = this.store.get(name);
      if (!series) {
        continue;
      }
      // Purging one queue subtracts it from the rollup instead of wiping it, mirroring
      // what the real admin does to keep the global series consistent.
      const subtractFrom = queue && name === GLOBAL_QUEUE ? this.store.get(queue) : undefined;
      if (queue && name === GLOBAL_QUEUE && !subtractFrom) {
        continue;
      }

      for (const metric of METRICS) {
        const target = series[metric];
        const daysBefore = countDays(target);

        // Deleting the entry a Map iterator is sitting on is well defined, and `set` only
        // ever overwrites a key that is already there, so this can mutate as it walks.
        for (const [hourStart, value] of target) {
          if (hourStart >= cutoff) {
            continue;
          }
          if (subtractFrom) {
            const remainder = value - (subtractFrom[metric].get(hourStart) ?? 0);
            if (remainder > 0) {
              target.set(hourStart, remainder);
              continue;
            }
          }
          target.delete(hourStart);
        }

        const daysRemoved = daysBefore - countDays(target);
        // One minute hash plus one hour hash per day, and one field in the totals hash.
        keysDeleted += daysRemoved * 2;
        fieldsDeleted += daysRemoved;
        if (daysBefore > 0 && target.size === 0) {
          keysDeleted += 1; // the totals hash itself
        }
      }
    }

    return { keysDeleted, fieldsDeleted };
  }
}

function countDays(series: Series): number {
  const days = new Set<number>();
  for (const hourStart of series.keys()) {
    days.add(alignDay(hourStart));
  }
  return days.size;
}

/**
 * Turns an hourly series into the three-tier footprint the recorder would have written:
 * a minute hash and an hour hash per active day, plus one field per day in the totals
 * hash. Minute buckets only survive their shorter retention window.
 */
function measureSeries(
  series: Series,
  minuteCutoff: number
): {
  tiers: Record<'minute' | 'hour' | 'day', MetricsHistoryTierUsage>;
  days: string[];
  minutes: number;
} {
  const tiers = emptyTiers();
  const days = new Set<string>();
  const minuteDays = new Set<string>();
  let activeHours = 0;
  let minutes = 0;

  for (const [hourStart, value] of series) {
    if (value <= 0) {
      continue;
    }
    activeHours += 1;
    const day = toIsoDay(hourStart);
    days.add(day);

    if (hourStart >= minuteCutoff) {
      minuteDays.add(day);
      // A minute bucket exists for every minute the queue processed something; assume a
      // few jobs per active minute, capped at the 60 buckets an hour can hold.
      minutes += Math.min(60, Math.max(1, Math.round(value / 3)));
    }
  }

  tiers.minute = { keys: minuteDays.size, bytes: minutes * BYTES_PER_MINUTE_BUCKET };
  tiers.hour = { keys: days.size, bytes: activeHours * BYTES_PER_HOUR_BUCKET };
  tiers.day = { keys: days.size > 0 ? 1 : 0, bytes: days.size * BYTES_PER_DAY_FIELD };

  return { tiers, days: [...days], minutes };
}
