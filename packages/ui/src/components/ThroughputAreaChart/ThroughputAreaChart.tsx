import type { MetricsHistoryGranularity } from '@bull-board/api/typings/app';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TooltipContentProps } from 'recharts';
import { isPartialBucket } from '../../utils/partialBucket';
import { withPartialThroughputTail } from './throughputSeries';
import type { ThroughputPlotRow, ThroughputRow } from './throughputSeries';
import s from './ThroughputAreaChart.module.css';

export interface ThroughputAreaChartProps {
  data: ThroughputRow[];
  /** Namespaces the gradient <linearGradient> ids so multiple charts on one page do not collide. */
  idPrefix: string;
  height?: number;
  /** Formats the tooltip's top label line from a row (e.g. "3 minutes ago" or a date). */
  formatTooltipLabel: (row: ThroughputRow) => string;
  /** Optional unit shown after each tooltip value (e.g. "/min"). Omit for daily counts. */
  valueUnit?: string;
  /** Show horizontal gridlines and X/Y axis ticks. Off by default to keep compact charts clean. */
  showAxis?: boolean;
  /** Formats the X axis ticks (only when showAxis). */
  formatXTick?: (x: number) => string;
  /** `data`'s bucket period, so the chart can tell a still-forming bucket (today, this hour)
   *  apart from a complete one and draw its closing segment dashed. Omit for series that
   *  aren't calendar buckets, e.g. the native 60-minute view's per-minute index. */
  granularity?: MetricsHistoryGranularity;
}

const compactNumber = (value: number): string => {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  }
  return String(value);
};

export const ThroughputAreaChart = ({
  data,
  idPrefix,
  height = 140,
  formatTooltipLabel,
  valueUnit,
  showAxis = false,
  formatXTick,
  granularity,
}: ThroughputAreaChartProps) => {
  const { t } = useTranslation();
  const completedGradientId = `${idPrefix}-completed`;
  const failedGradientId = `${idPrefix}-failed`;
  const axisTick = { fill: 'var(--muted-foreground)', fontSize: 11 };

  // See LatencyChart for the same treatment: the last bucket of the current period only
  // covers however much of it has elapsed so far, so its closing segment is split off and
  // drawn dashed instead of cliffing next to complete prior buckets.
  const lastRow = data[data.length - 1];
  const isLastPartial = Boolean(granularity && lastRow && isPartialBucket(lastRow.x, granularity));
  const plotData = useMemo(
    () => withPartialThroughputTail(data, isLastPartial),
    [data, isLastPartial]
  );

  // Static swatches, not toggles -- there is nothing to hide behind them, unlike the latency
  // legend's per-percentile buttons. Mirrors LatencyChart's legend position (below the stat
  // tiles, above the chart) so throughput and latency read as one consistent layout.
  const legend = data.length > 0 && (
    <div className={s.legend}>
      <span className={s.legendItem}>
        <span className={s.legendSwatch} style={{ backgroundColor: 'var(--status-completed)' }} />
        {t('METRICS.COMPLETED')}
      </span>
      <span className={s.legendItem}>
        <span className={s.legendSwatch} style={{ backgroundColor: 'var(--status-failed)' }} />
        {t('METRICS.FAILED')}
      </span>
    </div>
  );

  const renderTooltip = ({ active, payload }: TooltipContentProps) => {
    if (!active || !payload || payload.length === 0) {
      return null;
    }
    const point = payload[0].payload as ThroughputPlotRow;
    // A partial point's own completed/failed were moved to their `Tail` counterpart by
    // withPartialThroughputTail so the solid area stops short of it; read through to find the
    // value that's still there to display.
    const row: ThroughputRow = {
      x: point.x,
      completed: point.completed ?? point.completedTail ?? 0,
      failed: point.failed ?? point.failedTail ?? 0,
    };
    const isPartialPoint = isLastPartial && point.x === lastRow?.x;

    return (
      <div className={s.tooltip}>
        <div className={s.tooltipTime}>{formatTooltipLabel(row)}</div>
        <div className={s.tooltipRow}>
          <span
            className={s.tooltipSwatch}
            style={{ backgroundColor: 'var(--status-completed)' }}
          />
          <span className={s.tooltipName}>{t('METRICS.COMPLETED')}</span>
          <span className={s.tooltipValue}>
            {row.completed.toLocaleString()}
            {valueUnit ? <span className={s.tooltipUnit}>{valueUnit}</span> : null}
          </span>
        </div>
        <div className={s.tooltipRow}>
          <span className={s.tooltipSwatch} style={{ backgroundColor: 'var(--status-failed)' }} />
          <span className={s.tooltipName}>{t('METRICS.FAILED')}</span>
          <span className={s.tooltipValue}>
            {row.failed.toLocaleString()}
            {valueUnit ? <span className={s.tooltipUnit}>{valueUnit}</span> : null}
          </span>
        </div>
        {isPartialPoint && <div className={s.tooltipNote}>{t('METRICS.PARTIAL_PERIOD')}</div>}
      </div>
    );
  };

  return (
    <div className={s.chart}>
      {legend}
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart
          data={plotData}
          margin={
            showAxis
              ? { top: 8, right: 8, bottom: 4, left: 0 }
              : { top: 8, right: 4, bottom: 0, left: 4 }
          }
        >
          <defs>
            <linearGradient id={completedGradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--status-completed)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--status-completed)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id={failedGradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--status-failed)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--status-failed)" stopOpacity={0} />
            </linearGradient>
          </defs>
          {showAxis ? (
            <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.5} />
          ) : null}
          {showAxis ? (
            <XAxis
              dataKey="x"
              tick={axisTick}
              tickMargin={8}
              minTickGap={48}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatXTick}
            />
          ) : (
            <XAxis dataKey="x" hide />
          )}
          {showAxis ? (
            <YAxis
              width={44}
              tick={axisTick}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              domain={[0, 'dataMax']}
              tickFormatter={compactNumber}
            />
          ) : (
            <YAxis hide domain={[0, 'dataMax']} />
          )}
          <Tooltip
            content={renderTooltip}
            cursor={{ stroke: 'var(--muted-foreground)', strokeWidth: 1, strokeOpacity: 0.6 }}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="completed"
            stroke="var(--status-completed)"
            strokeWidth={1.5}
            fill={`url(#${completedGradientId})`}
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
            isAnimationActive={false}
            connectNulls={false}
          />
          <Area
            type="monotone"
            dataKey="failed"
            stroke="var(--status-failed)"
            strokeWidth={1.5}
            fill={`url(#${failedGradientId})`}
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
            isAnimationActive={false}
            connectNulls={false}
          />
          {isLastPartial && (
            <>
              {/* The closing segment of an in-progress bucket, redrawn dashed. Its data only
                covers the last two points (see withPartialThroughputTail), picking up exactly
                where each solid area above stops. */}
              <Area
                type="monotone"
                dataKey="completedTail"
                stroke="var(--status-completed)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                fill={`url(#${completedGradientId})`}
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
                isAnimationActive={false}
                connectNulls={false}
              />
              <Area
                type="monotone"
                dataKey="failedTail"
                stroke="var(--status-failed)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                fill={`url(#${failedGradientId})`}
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
                isAnimationActive={false}
                connectNulls={false}
              />
            </>
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
