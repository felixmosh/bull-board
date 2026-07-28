import type { ReactNode } from 'react';
import s from './MetricsCharts.module.css';

export interface MetricsChartsProps {
  throughput?: ReactNode;
  latency?: ReactNode;
}

/**
 * Shared two-up layout for the throughput and latency charts, used identically by the queue
 * detail page and the metrics history page so the two cannot drift apart. Throughput is counts
 * and latency is durations, so they never share a Y axis, but side by side they read as one
 * story about the same range instead of a wall of stacked charts.
 *
 * Falls back to a single column when only one chart is present (e.g. no latency provider
 * configured), and renders nothing when neither is.
 */
export const MetricsCharts = ({ throughput, latency }: MetricsChartsProps) => {
  if (!throughput && !latency) {
    return null;
  }

  const isPair = Boolean(throughput) && Boolean(latency);

  return (
    <div className={isPair ? s.grid : s.single}>
      {throughput && <div className={s.cell}>{throughput}</div>}
      {latency && <div className={s.cell}>{latency}</div>}
    </div>
  );
};
