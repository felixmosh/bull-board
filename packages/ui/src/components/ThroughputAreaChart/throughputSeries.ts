import type {
  MetricsHistoryPoint,
  QueueMetrics as QueueMetricsData,
} from '@bull-board/api/typings/app';
import { withPartialTail } from '../../utils/partialBucket';

export interface ThroughputRow {
  /** X value: the native path uses a numeric bucket index; the history path uses epoch ms. */
  x: number;
  completed: number;
  failed: number;
}

/** Render-only shape: `completed`/`failed` widen to optional because withPartialThroughputTail
 *  clears the last row's own value once it moves to its `Tail` counterpart (see that function),
 *  and adds the two `Tail` fields the chart's dashed closing segment reads from. */
export interface ThroughputPlotRow {
  x: number;
  completed?: number;
  failed?: number;
  completedTail?: number;
  failedTail?: number;
}

const THROUGHPUT_TAIL_KEYS = ['completed', 'failed'] as const;

/**
 * Splits the closing segment of the completed/failed series so the chart can draw it dashed
 * when the last bucket is partial (still in progress). Thin, typed wrapper around the generic
 * `withPartialTail`: see that function for the mechanics.
 */
export function withPartialThroughputTail(
  rows: ThroughputRow[],
  isLastPartial: boolean
): ThroughputPlotRow[] {
  return withPartialTail(rows, THROUGHPUT_TAIL_KEYS, isLastPartial);
}

export const NATIVE_WINDOW = 60;

/**
 * Native 60m path. Convert a BullMQ getMetrics result into a 60-length per-minute
 * array, newest bucket last. data[i] maps to a minute via prevTS; the live
 * (in-progress) minute is count - prevCount.
 */
export function toNativeSeries(
  metrics: QueueMetricsData | null | undefined,
  nowMs: number
): number[] {
  const series: number[] = Array.from({ length: NATIVE_WINDOW }, () => 0);
  if (!metrics) {
    return series;
  }
  const prevTS = metrics.meta?.prevTS || nowMs;
  const live = Math.max(0, (metrics.meta?.count ?? 0) - (metrics.meta?.prevCount ?? 0));
  const idleMinutes = Math.max(0, Math.floor(nowMs / 60000) - Math.floor(prevTS / 60000));
  const newestFirst = [live, ...(metrics.data ?? [])];
  for (let j = 0; j < newestFirst.length; j++) {
    const minutesAgo = idleMinutes + j;
    if (minutesAgo >= NATIVE_WINDOW) {
      break;
    }
    series[NATIVE_WINDOW - 1 - minutesAgo] = newestFirst[j];
  }
  return series;
}

export function toNativeRows(completed: number[], failed: number[]): ThroughputRow[] {
  return completed.map((value, index) => ({
    x: index,
    completed: value,
    failed: failed[index] ?? 0,
  }));
}

/** Merge completed + failed history point arrays into rows keyed by ts, sorted ascending. */
export function toHistoryRows(
  completed: MetricsHistoryPoint[],
  failed: MetricsHistoryPoint[]
): ThroughputRow[] {
  const byTs = new Map<number, ThroughputRow>();
  for (const p of completed) {
    byTs.set(p.ts, { x: p.ts, completed: p.value, failed: 0 });
  }
  for (const p of failed) {
    const row = byTs.get(p.ts) ?? { x: p.ts, completed: 0, failed: 0 };
    row.failed = p.value;
    byTs.set(p.ts, row);
  }
  return [...byTs.values()].sort((a, b) => a.x - b.x);
}

export const sum = (values: number[]): number => values.reduce((acc, v) => acc + v, 0);
