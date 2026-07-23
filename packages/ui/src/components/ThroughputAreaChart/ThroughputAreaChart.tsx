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
import type { ThroughputRow } from './throughputSeries';
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
}: ThroughputAreaChartProps) => {
  const { t } = useTranslation();
  const completedGradientId = `${idPrefix}-completed`;
  const failedGradientId = `${idPrefix}-failed`;
  const axisTick = { fill: 'var(--accent-color)', fontSize: 11 };

  const renderTooltip = ({ active, payload }: TooltipContentProps) => {
    if (!active || !payload || payload.length === 0) {
      return null;
    }
    const row = payload[0].payload as ThroughputRow;
    return (
      <div className={s.tooltip}>
        <div className={s.tooltipTime}>{formatTooltipLabel(row)}</div>
        <div className={s.tooltipRow}>
          <span className={s.tooltipSwatch} style={{ backgroundColor: 'var(--completed)' }} />
          <span className={s.tooltipName}>{t('METRICS.COMPLETED')}</span>
          <span className={s.tooltipValue}>
            {row.completed}
            {valueUnit ? <span className={s.tooltipUnit}>{valueUnit}</span> : null}
          </span>
        </div>
        <div className={s.tooltipRow}>
          <span className={s.tooltipSwatch} style={{ backgroundColor: 'var(--failed)' }} />
          <span className={s.tooltipName}>{t('METRICS.FAILED')}</span>
          <span className={s.tooltipValue}>
            {row.failed}
            {valueUnit ? <span className={s.tooltipUnit}>{valueUnit}</span> : null}
          </span>
        </div>
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart
        data={data}
        margin={
          showAxis
            ? { top: 8, right: 8, bottom: 4, left: 0 }
            : { top: 8, right: 4, bottom: 0, left: 4 }
        }
      >
        <defs>
          <linearGradient id={completedGradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--completed)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--completed)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id={failedGradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--failed)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--failed)" stopOpacity={0} />
          </linearGradient>
        </defs>
        {showAxis ? (
          <CartesianGrid vertical={false} stroke="var(--separator-color)" strokeOpacity={0.5} />
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
          cursor={{ stroke: 'var(--accent-color)', strokeWidth: 1, strokeOpacity: 0.6 }}
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="completed"
          stroke="var(--completed)"
          strokeWidth={1.5}
          fill={`url(#${completedGradientId})`}
          dot={false}
          activeDot={{ r: 3, strokeWidth: 0 }}
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="failed"
          stroke="var(--failed)"
          strokeWidth={1.5}
          fill={`url(#${failedGradientId})`}
          dot={false}
          activeDot={{ r: 3, strokeWidth: 0 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};
