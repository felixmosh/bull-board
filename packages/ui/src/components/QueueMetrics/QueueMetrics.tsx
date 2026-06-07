import type { AppQueue, QueueMetrics as QueueMetricsData } from '@bull-board/api/typings/app';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TooltipContentProps } from 'recharts';
import { useMetrics } from '../../hooks/useMetrics';
import { Card } from '../Card/Card';
import s from './QueueMetrics.module.css';

interface QueueMetricsProps {
  queue: AppQueue;
}

const WINDOW = 60;

interface MetricsPoint {
  index: number;
  minutesAgo: number;
  completed: number;
  failed: number;
}

function toSeries(metrics: QueueMetricsData | null | undefined, nowMs: number): number[] {
  const series: number[] = Array.from({ length: WINDOW }, () => 0);
  if (!metrics) {
    return series;
  }
  const prevTS = metrics.meta?.prevTS || nowMs;
  const live = Math.max(0, (metrics.meta?.count ?? 0) - (metrics.meta?.prevCount ?? 0));
  const idleMinutes = Math.max(0, Math.floor(nowMs / 60000) - Math.floor(prevTS / 60000));
  const newestFirst = [live, ...(metrics.data ?? [])];
  for (let j = 0; j < newestFirst.length; j++) {
    const minutesAgo = idleMinutes + j;
    if (minutesAgo >= WINDOW) {
      break;
    }
    series[WINDOW - 1 - minutesAgo] = newestFirst[j];
  }
  return series;
}

const sum = (values: number[]) => values.reduce((acc, value) => acc + value, 0);

export const QueueMetrics = ({ queue }: QueueMetricsProps) => {
  const { t } = useTranslation();
  const { metrics, loading } = useMetrics(queue.name);

  const now = Date.now();
  const completed = toSeries(metrics?.completed, now);
  const failed = toSeries(metrics?.failed, now);

  if (loading && !metrics) {
    return null;
  }

  const hasMetrics = [metrics?.completed, metrics?.failed].some(
    (m) => (m?.meta?.count ?? 0) > 0 || (m?.data?.length ?? 0) > 0
  );

  if (!hasMetrics) {
    return (
      <Card className={s.metricsCard}>
        <div className={s.header}>
          <h3 className={s.title}>{t('METRICS.TITLE')}</h3>
        </div>
        <p className={s.empty}>{t('METRICS.EMPTY')}</p>
      </Card>
    );
  }

  const data: MetricsPoint[] = completed.map((value, index) => ({
    index,
    minutesAgo: WINDOW - 1 - index,
    completed: value,
    failed: failed[index] ?? 0,
  }));

  const renderTooltip = ({ active, payload }: TooltipContentProps) => {
    if (!active || !payload || payload.length === 0) {
      return null;
    }
    const point = payload[0].payload as MetricsPoint;
    return (
      <div className={s.tooltip}>
        <div className={s.tooltipTime}>
          {point.minutesAgo === 0
            ? t('METRICS.NOW')
            : t('METRICS.MINUTES_AGO', { minutes: point.minutesAgo })}
        </div>
        <div className={s.tooltipRow}>
          <span className={s.tooltipSwatch} style={{ backgroundColor: 'var(--completed)' }} />
          <span className={s.tooltipName}>{t('METRICS.COMPLETED')}</span>
          <span className={s.tooltipValue}>
            {point.completed}
            <span className={s.tooltipUnit}>{t('METRICS.PER_MIN_UNIT')}</span>
          </span>
        </div>
        <div className={s.tooltipRow}>
          <span className={s.tooltipSwatch} style={{ backgroundColor: 'var(--failed)' }} />
          <span className={s.tooltipName}>{t('METRICS.FAILED')}</span>
          <span className={s.tooltipValue}>
            {point.failed}
            <span className={s.tooltipUnit}>{t('METRICS.PER_MIN_UNIT')}</span>
          </span>
        </div>
      </div>
    );
  };

  const completedRate = completed[WINDOW - 2] ?? 0;
  const failedRate = failed[WINDOW - 2] ?? 0;
  const peak = Math.max(0, ...completed, ...failed);

  return (
    <Card className={s.metricsCard}>
      <div className={s.header}>
        <h3 className={s.title}>{t('METRICS.TITLE')}</h3>
        <div className={s.legend}>
          <span className={s.legendItem}>
            <span className={s.swatch} style={{ backgroundColor: 'var(--completed)' }} />
            {t('METRICS.COMPLETED')}
          </span>
          <span className={s.legendItem}>
            <span className={s.swatch} style={{ backgroundColor: 'var(--failed)' }} />
            {t('METRICS.FAILED')}
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={140}>
        <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="metric-completed" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--completed)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--completed)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="metric-failed" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--failed)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--failed)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="index" hide />
          <YAxis hide domain={[0, 'dataMax']} />
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
            fill="url(#metric-completed)"
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="failed"
            stroke="var(--failed)"
            strokeWidth={1.5}
            fill="url(#metric-failed)"
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>

      <div className={s.summary}>
        <div className={s.stat}>
          <span className={s.statValue}>{completedRate}</span>
          <span className={s.statLabel}>{t('METRICS.COMPLETED_PER_MIN')}</span>
        </div>
        <div className={s.stat}>
          <span className={s.statValue}>{failedRate}</span>
          <span className={s.statLabel}>{t('METRICS.FAILED_PER_MIN')}</span>
        </div>
        <div className={s.stat}>
          <span className={s.statValue}>{peak}</span>
          <span className={s.statLabel}>{t('METRICS.PEAK_PER_MIN')}</span>
        </div>
        <div className={s.stat}>
          <span className={s.statValue}>{sum(completed)}</span>
          <span className={s.statLabel}>{t('METRICS.WINDOW_COMPLETED', { minutes: WINDOW })}</span>
        </div>
      </div>
    </Card>
  );
};
