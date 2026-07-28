import type { MetricsHistoryPoint, MetricsLatencyPoint } from '@bull-board/api/typings/app';
import { withPartialTail } from '../../utils/partialBucket';

export const PERCENTILES = [50, 95, 99];

/** Below this many samples, a point's tooltip carries an explicit low-confidence note. */
export const LOW_CONFIDENCE_THRESHOLD = 5;

/** Sample count at which a line segment is drawn at full opacity. Below it, opacity tapers. */
const CONFIDENT_SAMPLE_COUNT = 20;
/** Opacity floor so a zero-sample point is dim, not invisible. */
const MIN_OPACITY = 0.3;

/** All seven toggleable series the merged chart can plot: run and wait each carry three
 *  percentiles, plus the queue-age gauge. */
export type LatencySeriesKey =
  | 'runP50'
  | 'runP95'
  | 'runP99'
  | 'waitP50'
  | 'waitP95'
  | 'waitP99'
  | 'queueAge';

export const LATENCY_SERIES_KEYS: readonly LatencySeriesKey[] = [
  'runP50',
  'runP95',
  'runP99',
  'waitP50',
  'waitP95',
  'waitP99',
  'queueAge',
];

/** Run p95, wait p95 and queue age read as the useful default: one line per metric family
 *  plus the live gauge. The six individual percentiles stay opt-in so the chart opens quiet. */
export const DEFAULT_LATENCY_SERIES: readonly LatencySeriesKey[] = [
  'runP95',
  'waitP95',
  'queueAge',
];

/** One `${key}Tail` field per series key, populated only on the last one or two rows when the
 *  final bucket is partial. See `withPartialTail` in `../../utils/partialBucket`. */
type LatencyTailFields = { [K in LatencySeriesKey as `${K}Tail`]?: number };

export interface LatencyRow extends LatencyTailFields {
  x: number;
  /** Samples behind the run-time point at this bucket. Undefined where only wait/queue-age reported. */
  runCount?: number;
  /** Samples behind the wait-time point at this bucket. Undefined where only run/queue-age reported. */
  waitCount?: number;
  runP50?: number;
  runP95?: number;
  runP99?: number;
  waitP50?: number;
  waitP95?: number;
  waitP99?: number;
  /** Age in ms of the oldest job in the queue at this point. Not a percentile: a live gauge. */
  queueAge?: number;
}

/**
 * Smallest duration a log axis can plot. log(0) is undefined, and near-zero wait/run times
 * are a legitimate reading on an idle queue, so values below this are clamped up to it
 * rather than dropped. 1ms is below anything formatDuration renders as distinct from "0ms",
 * so the clamp is invisible at the label level.
 */
export const LATENCY_LOG_FLOOR_MS = 1;

/** The duration-valued fields of a row, i.e. every series key minus the sample counts. */
const DURATION_KEYS: readonly LatencySeriesKey[] = LATENCY_SERIES_KEYS;

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
 * `keys` restricts which series feed the domain, defaulting to all seven. The chart passes
 * only the currently-enabled series so toggling off, say, every run-time line lets the axis
 * re-fit around whatever is still visible instead of staying stretched for a hidden line.
 *
 * Falls back to a linear domain when a log scale can't represent the data: no numeric points
 * at all, or every point clamping to the same value (all zero, or one distinct value). A log
 * domain with equal min and max collapses to nothing, so this fallback is load-bearing.
 */
export function computeLatencyAxisDomain(
  rows: LatencyRow[],
  keys: readonly LatencySeriesKey[] = DURATION_KEYS,
  floor: number = LATENCY_LOG_FLOOR_MS
): LatencyAxisDomain {
  const values: number[] = [];
  for (const row of rows) {
    for (const key of keys) {
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
 * Merges run-time percentiles, wait-time percentiles and the queue-age scalar series by
 * timestamp bucket into one row per bucket. The union of all three timestamp sets is kept
 * (not just the intersection): a completion-derived histogram goes quiet exactly when a queue
 * backs up and nothing finishes, but queue age keeps reporting for that same bucket, and run
 * time and wait time can independently go quiet from each other too. Fields absent for a given
 * bucket are left undefined, which recharts renders as a gap in that line rather than a false
 * zero or a fabricated shared point.
 */
export function toLatencyRows(
  runPoints: MetricsLatencyPoint[],
  waitPoints: MetricsLatencyPoint[] = [],
  queueAgePoints: MetricsHistoryPoint[] = []
): LatencyRow[] {
  const byTs = new Map<number, LatencyRow>();

  for (const p of runPoints) {
    const row = byTs.get(p.ts) ?? { x: p.ts };
    row.runCount = p.count;
    row.runP50 = p.values['50'];
    row.runP95 = p.values['95'];
    row.runP99 = p.values['99'];
    byTs.set(p.ts, row);
  }

  for (const p of waitPoints) {
    const row = byTs.get(p.ts) ?? { x: p.ts };
    row.waitCount = p.count;
    row.waitP50 = p.values['50'];
    row.waitP95 = p.values['95'];
    row.waitP99 = p.values['99'];
    byTs.set(p.ts, row);
  }

  for (const p of queueAgePoints) {
    const row = byTs.get(p.ts) ?? { x: p.ts };
    row.queueAge = p.value;
    byTs.set(p.ts, row);
  }

  return [...byTs.values()].sort((a, b) => a.x - b.x);
}

/**
 * Splits the closing segment of every latency series so the chart can draw it dashed when the
 * last bucket is partial (still in progress). Thin, typed wrapper around the generic
 * `withPartialTail`: see that function for the mechanics.
 */
export function withPartialLatencyTail(rows: LatencyRow[], isLastPartial: boolean): LatencyRow[] {
  return withPartialTail(rows, LATENCY_SERIES_KEYS, isLastPartial);
}
