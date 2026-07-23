import type { QueueMetrics } from '@bull-board/api/typings/app';

export interface MinutePoint {
  /** Absolute minute index: Math.floor(timestampMs / 60000). */
  minute: number;
  value: number;
}

const MS_PER_MINUTE = 60000;

/**
 * Maps BullMQ's getMetrics() data (newest-first) to (minute, value) points.
 * data[i] -> minute index floor(prevTS/60000) - 1 - i. The in-progress current
 * minute is never present in data, so every point returned here is immutable.
 */
export function metricsToMinutePoints(metrics: QueueMetrics | null | undefined): MinutePoint[] {
  if (!metrics || !metrics.data || metrics.data.length === 0) {
    return [];
  }
  const prevTS = metrics.meta?.prevTS ?? 0;
  const newestMinute = Math.floor(prevTS / MS_PER_MINUTE) - 1;

  const points: MinutePoint[] = [];
  for (let i = 0; i < metrics.data.length; i++) {
    const minute = newestMinute - i;
    if (minute < 0) {
      break;
    }
    points.push({ minute, value: Number(metrics.data[i]) || 0 });
  }
  return points;
}
