import type { MetricsHistoryPoint, MetricsLatencyPoint } from '@bull-board/api/typings/app';

export const PERCENTILES = [50, 95, 99];

/** Below this many samples, a point's tooltip carries an explicit low-confidence note. */
export const LOW_CONFIDENCE_THRESHOLD = 5;

/** Sample count at which a line segment is drawn at full opacity. Below it, opacity tapers. */
const CONFIDENT_SAMPLE_COUNT = 20;
/** Opacity floor so a zero-sample point is dim, not invisible. */
const MIN_OPACITY = 0.3;

export interface LatencyRow {
  x: number;
  /** Samples behind this point. Undefined for a bucket only reported by the queue-age series. */
  count?: number;
  p50?: number;
  p95?: number;
  p99?: number;
  /** Age in ms of the oldest job in the queue at this point. Only set on the wait chart. */
  queueAge?: number;
}

/**
 * Smallest duration a log axis can plot. log(0) is undefined, and near-zero wait/run times
 * are a legitimate reading on an idle queue, so values below this are clamped up to it
 * rather than dropped. 1ms is below anything formatDuration renders as distinct from "0ms",
 * so the clamp is invisible at the label level.
 */
export const LATENCY_LOG_FLOOR_MS = 1;

const DURATION_KEYS = ['p50', 'p95', 'p99', 'queueAge'] as const;

/** "Nice" round durations a log axis ticks against, so labels read 1ms / 100ms / 1s / 30s / 2m
 *  instead of the odd multiplicatively-spaced values a generic log scale would produce. */
const NICE_DURATION_TICKS_MS = [
  1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 30000, 60000, 120000, 300000,
  600000, 900000, 1800000, 3600000, 7200000, 21600000, 43200000, 86400000,
];

const MAX_LOG_TICKS = 6;

/** Clamps a duration up to the log floor. Undefined/non-finite values pass through unchanged
 *  so recharts still renders them as a gap rather than a fabricated point. */
export function clampToLogFloor(
  value: number | undefined,
  floor: number = LATENCY_LOG_FLOOR_MS
): number | undefined {
  if (value === undefined || !Number.isFinite(value)) {
    return value;
  }
  return value < floor ? floor : value;
}

/**
 * Returns a copy of rows with every duration field floored for log-axis plotting. Only meant
 * to be applied when the axis actually is logarithmic; on the linear fallback the raw rows
 * are used unchanged.
 */
export function clampLatencyRowsToLogFloor(
  rows: LatencyRow[],
  floor: number = LATENCY_LOG_FLOOR_MS
): LatencyRow[] {
  return rows.map((row) => {
    const clamped: LatencyRow = { ...row };
    for (const key of DURATION_KEYS) {
      clamped[key] = clampToLogFloor(row[key], floor);
    }
    return clamped;
  });
}

export interface LatencyAxisDomain {
  scale: 'log' | 'linear';
  domain: [number | string, number | string];
}

/**
 * Computes the y-axis domain from the rendered rows, never a hardcoded range: a queue whose
 * jobs all complete in single-digit milliseconds gets a domain that spreads across those
 * milliseconds, not one anchored to a fixed floor.
 *
 * Falls back to a linear domain when a log scale can't represent the data: no numeric points
 * at all, or every point clamping to the same value (all zero, or one distinct value). A log
 * domain with equal min and max collapses to nothing, so this fallback is load-bearing.
 */
export function computeLatencyAxisDomain(
  rows: LatencyRow[],
  floor: number = LATENCY_LOG_FLOOR_MS
): LatencyAxisDomain {
  const values: number[] = [];
  for (const row of rows) {
    for (const key of DURATION_KEYS) {
      const value = row[key];
      if (value !== undefined && Number.isFinite(value)) {
        values.push(clampToLogFloor(value, floor) as number);
      }
    }
  }

  if (values.length === 0) {
    return { scale: 'linear', domain: [0, 'dataMax'] };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);

  if (min === max) {
    return { scale: 'linear', domain: [0, 'dataMax'] };
  }

  return { scale: 'log', domain: [min, max] };
}

/**
 * Picks human-readable tick values for a log axis from a fixed ladder of round durations,
 * thinned to a readable count. Returns an empty array when the range can't contain a ladder
 * value, letting the caller fall back to recharts' own tick placement.
 */
export function computeLogTicks(min: number, max: number): number[] {
  if (!(min > 0) || !(max > min)) {
    return [];
  }

  const candidates = NICE_DURATION_TICKS_MS.filter((tick) => tick >= min && tick <= max);
  if (candidates.length === 0) {
    return [min, max];
  }
  if (candidates.length <= MAX_LOG_TICKS) {
    return candidates;
  }

  const step = (candidates.length - 1) / (MAX_LOG_TICKS - 1);
  const thinned = new Set<number>();
  for (let i = 0; i < MAX_LOG_TICKS; i++) {
    thinned.add(candidates[Math.round(i * step)]);
  }
  return [...thinned];
}

/**
 * Formats a millisecond duration as a human unit: 75 -> "75ms", 4750 -> "4.8s",
 * 90000 -> "1m 30s". Never renders raw milliseconds past the first tier.
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) {
    return '0ms';
  }

  const sign = ms < 0 ? '-' : '';
  const abs = Math.abs(ms);

  if (abs < 1000) {
    return `${sign}${Math.round(abs)}ms`;
  }

  if (abs < 60000) {
    const seconds = Math.round((abs / 1000) * 10) / 10;
    const label = Number.isInteger(seconds) ? String(seconds) : seconds.toFixed(1);
    return `${sign}${label}s`;
  }

  if (abs < 3600000) {
    const totalSeconds = Math.round(abs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return seconds === 0 ? `${sign}${minutes}m` : `${sign}${minutes}m ${seconds}s`;
  }

  const totalMinutes = Math.round(abs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${sign}${hours}h` : `${sign}${hours}h ${minutes}m`;
}

/**
 * Maps a sample count to a stroke opacity: full confidence at CONFIDENT_SAMPLE_COUNT
 * or more samples, tapering linearly down to MIN_OPACITY at zero. A p99 backed by a
 * handful of samples should read as faint, not as fact.
 */
export function confidenceOpacity(count: number): number {
  if (!Number.isFinite(count) || count <= 0) {
    return MIN_OPACITY;
  }
  const ratio = Math.min(1, count / CONFIDENT_SAMPLE_COUNT);
  return MIN_OPACITY + (1 - MIN_OPACITY) * ratio;
}

/**
 * Merges latency percentile points with the queue-age scalar series by timestamp bucket.
 * The union of both timestamp sets is kept (not just the latency ones): a completion-derived
 * histogram goes quiet exactly when a queue backs up and nothing finishes, but queue age keeps
 * reporting for that same bucket. Dropping those buckets would bury the signal the overlay
 * exists to show. Percentile fields are left undefined for a queue-age-only bucket, which
 * recharts renders as a gap in those lines rather than a false zero.
 */
export function toLatencyRows(
  latencyPoints: MetricsLatencyPoint[],
  queueAgePoints: MetricsHistoryPoint[] = []
): LatencyRow[] {
  const byTs = new Map<number, LatencyRow>();

  for (const p of latencyPoints) {
    byTs.set(p.ts, {
      x: p.ts,
      count: p.count,
      p50: p.values['50'],
      p95: p.values['95'],
      p99: p.values['99'],
    });
  }

  for (const p of queueAgePoints) {
    const row = byTs.get(p.ts) ?? { x: p.ts };
    row.queueAge = p.value;
    byTs.set(p.ts, row);
  }

  return [...byTs.values()].sort((a, b) => a.x - b.x);
}
