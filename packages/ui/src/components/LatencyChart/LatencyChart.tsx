import type { MetricsHistoryGranularity, MetricsLatencyMetric } from '@bull-board/api/typings/app';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TooltipContentProps } from 'recharts';
import { useHistoryMetrics } from '../../hooks/useHistoryMetrics';
import { useLatencyMetrics } from '../../hooks/useLatencyMetrics';
import {
  clampLatencyRowsToLogFloor,
  computeLatencyAxisDomain,
  computeLogTicks,
  confidenceOpacity,
  formatDuration,
  LOW_CONFIDENCE_THRESHOLD,
  PERCENTILES,
  toLatencyRows,
} from './latencySeries';
import type { LatencyRow } from './latencySeries';
import s from './LatencyChart.module.css';

export interface LatencyChartProps {
  queue?: string;
  metric: MetricsLatencyMetric;
  from: number;
  to: number;
  granularity: MetricsHistoryGranularity;
  /** Namespaces the gradient <linearGradient> ids so multiple charts on one page do not collide. */
  idPrefix: string;
  height?: number;
}

/**
 * Ranked so p99 reads as the outlier and p50 as the calm baseline: the same
 * good -> caution -> alert colours the rest of the board already uses for job
 * status, drawn thinnest-to-boldest and back-to-front so p99 always sits on top.
 */
const PERCENTILE_LINES = [
  { key: 'p50', color: '--active', labelKey: 'LATENCY.P50', strokeWidth: 1.5 },
  { key: 'p95', color: '--waiting', labelKey: 'LATENCY.P95', strokeWidth: 1.75 },
  { key: 'p99', color: '--failed', labelKey: 'LATENCY.P99', strokeWidth: 2.25 },
] as const;

export const LatencyChart = ({
  queue,
  metric,
  from,
  to,
  granularity,
  idPrefix,
  height = 180,
}: LatencyChartProps) => {
  const { t } = useTranslation();
  const isWaitChart = metric === 'waittime';

  const { points, loading: latencyLoading } = useLatencyMetrics({
    queue,
    metric,
    from,
    to,
    granularity,
    percentiles: PERCENTILES,
  });

  // Queue age overlays the wait chart only: it is not a percentile of finished jobs, it is a
  // live gauge of the oldest job still sitting in the queue right now. That is precisely the
  // signal a completion-derived histogram misses once a queue backs up and stops finishing jobs.
  const { points: queueAgePoints, loading: queueAgeLoading } = useHistoryMetrics({
    queue,
    from,
    to,
    granularity,
    metric: 'queueage',
    enabled: isWaitChart,
  });

  // Reused to tell "no latency recorded yet" apart from "this queue completes no jobs": both
  // look identical from the latency endpoint alone (zero points either way).
  const { completed, loading: completedLoading } = useHistoryMetrics({
    queue,
    from,
    to,
    granularity,
  });

  const rows = useMemo(
    () => toLatencyRows(points, isWaitChart ? queueAgePoints : []),
    [points, queueAgePoints, isWaitChart]
  );

  // Latency is log-distributed: p99 can be two orders of magnitude above p50, which crushes
  // the faster percentiles flat against the bottom of a linear axis. A log axis fixes that,
  // but log(0) is undefined and a data set with no spread collapses a log domain to nothing,
  // so both the domain and the plotted rows fall back to linear when the data can't support it.
  const axisDomain = useMemo(() => computeLatencyAxisDomain(rows), [rows]);
  const isLogAxis = axisDomain.scale === 'log';
  const chartRows = useMemo(
    () => (isLogAxis ? clampLatencyRowsToLogFloor(rows) : rows),
    [rows, isLogAxis]
  );
  const logTicks = useMemo(
    () =>
      isLogAxis &&
      typeof axisDomain.domain[0] === 'number' &&
      typeof axisDomain.domain[1] === 'number'
        ? computeLogTicks(axisDomain.domain[0], axisDomain.domain[1])
        : [],
    [isLogAxis, axisDomain]
  );

  const loading = latencyLoading || (isWaitChart && queueAgeLoading) || completedLoading;
  const hasCompletions = completed.some((point) => point.value > 0);

  const axisTick = { fill: 'var(--accent-color)', fontSize: 11 };

  const formatXTick = (x: number) =>
    granularity === 'hour'
      ? new Date(x).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
      : new Date(x).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  const formatTooltipLabel = (x: number) =>
    granularity === 'hour' ? new Date(x).toLocaleString() : new Date(x).toLocaleDateString();

  const stops = chartRows.map((row, i) => ({
    offset: chartRows.length > 1 ? (i / (chartRows.length - 1)) * 100 : 100,
    opacity: confidenceOpacity(row.count ?? 0),
  }));

  const renderTooltip = ({ active, payload }: TooltipContentProps) => {
    if (!active || !payload || payload.length === 0) {
      return null;
    }
    const row = payload[0].payload as LatencyRow;
    const showLowConfidence =
      row.count !== undefined && row.count > 0 && row.count < LOW_CONFIDENCE_THRESHOLD;

    return (
      <div className={s.tooltip}>
        <div className={s.tooltipTime}>{formatTooltipLabel(row.x)}</div>
        {PERCENTILE_LINES.map(({ key, color, labelKey }) => {
          const value = row[key];
          if (value === undefined) {
            return null;
          }
          return (
            <div className={s.tooltipRow} key={key}>
              <span className={s.tooltipSwatch} style={{ backgroundColor: `var(${color})` }} />
              <span className={s.tooltipName}>{t(labelKey)}</span>
              <span className={s.tooltipValue}>{formatDuration(value)}</span>
            </div>
          );
        })}
        {showLowConfidence && (
          <div className={s.tooltipNote}>{t('LATENCY.LOW_CONFIDENCE', { count: row.count })}</div>
        )}
        {isWaitChart && row.queueAge !== undefined && (
          <>
            <div className={s.tooltipDivider} />
            <div className={s.tooltipRow}>
              <span className={`${s.tooltipSwatch} ${s.tooltipSwatchDashed}`} />
              <span className={s.tooltipName}>{t('LATENCY.QUEUE_AGE')}</span>
              <span className={s.tooltipValue}>{formatDuration(row.queueAge)}</span>
            </div>
          </>
        )}
      </div>
    );
  };

  const title = t(isWaitChart ? 'LATENCY.TITLE_WAITTIME' : 'LATENCY.TITLE_RUNTIME');

  if (loading) {
    return null;
  }

  return (
    <div className={s.chart}>
      <div className={s.header}>
        <h4 className={s.title}>
          {title}
          {rows.length > 0 && isLogAxis && (
            <span className={s.scaleNote}>({t('LATENCY.LOG_SCALE_NOTE')})</span>
          )}
        </h4>
        {rows.length > 0 && (
          <div className={s.legend}>
            {PERCENTILE_LINES.map(({ key, color, labelKey }) => (
              <span className={s.legendItem} key={key}>
                <span className={s.legendDot} style={{ backgroundColor: `var(${color})` }} />
                {t(labelKey)}
              </span>
            ))}
            {isWaitChart && (
              <span className={s.legendItem}>
                <span className={`${s.legendDot} ${s.legendDotDashed}`} />
                {t('LATENCY.QUEUE_AGE')}
              </span>
            )}
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <p className={s.empty}>
          {t(hasCompletions ? 'LATENCY.EMPTY_NO_DATA' : 'LATENCY.EMPTY_NO_COMPLETIONS')}
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={chartRows} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
            <defs>
              {PERCENTILE_LINES.map(({ key, color }) => (
                <linearGradient key={key} id={`${idPrefix}-${key}`} x1="0" y1="0" x2="1" y2="0">
                  {stops.map((stop, i) => (
                    <stop
                      key={i}
                      offset={`${stop.offset}%`}
                      stopColor={`var(${color})`}
                      stopOpacity={stop.opacity}
                    />
                  ))}
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} stroke="var(--separator-color)" strokeOpacity={0.5} />
            <XAxis
              dataKey="x"
              tick={axisTick}
              tickMargin={8}
              minTickGap={48}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatXTick}
            />
            <YAxis
              width={52}
              tick={axisTick}
              axisLine={false}
              tickLine={false}
              scale={isLogAxis ? 'log' : 'linear'}
              domain={axisDomain.domain}
              ticks={isLogAxis ? logTicks : undefined}
              allowDataOverflow={isLogAxis}
              tickFormatter={formatDuration}
            />
            <Tooltip
              content={renderTooltip}
              cursor={{ stroke: 'var(--accent-color)', strokeWidth: 1, strokeOpacity: 0.6 }}
              isAnimationActive={false}
            />
            {PERCENTILE_LINES.map(({ key, color, strokeWidth }) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={`url(#${idPrefix}-${key})`}
                strokeWidth={strokeWidth}
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0, fill: `var(${color})` }}
                isAnimationActive={false}
                connectNulls={false}
              />
            ))}
            {isWaitChart && (
              <Line
                type="monotone"
                dataKey="queueAge"
                stroke="var(--delayed)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0, fill: 'var(--delayed)' }}
                isAnimationActive={false}
                connectNulls={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};
