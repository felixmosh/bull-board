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
