import type { AppQueue } from '@bull-board/api/typings/app';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHistoryMetrics } from '../../hooks/useHistoryMetrics';
import { useMetrics } from '../../hooks/useMetrics';
import { useRangeWindow } from '../../hooks/useRangeWindow';
import { useSettingsStore } from '../../hooks/useSettings';
import { useUIConfig } from '../../hooks/useUIConfig';
import { Card } from '../Card/Card';
import {
  NATIVE_WINDOW,
  sum,
  toHistoryRows,
  toNativeRows,
  toNativeSeries,
} from '../ThroughputAreaChart/throughputSeries';
import { HistoryMetricsView } from './HistoryMetricsView/HistoryMetricsView';
import { MetricsHeader } from './MetricsHeader/MetricsHeader';
import { NativeMetricsView } from './NativeMetricsView/NativeMetricsView';
import s from './QueueMetrics.module.css';

interface QueueMetricsProps {
  queue: AppQueue;
}

export type Range = '60m' | '7d' | '30d' | '90d';

const RANGE_DAYS: Record<Exclude<Range, '60m'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

export const QueueMetrics = ({ queue }: QueueMetricsProps) => {
  const { t } = useTranslation();
  const { metrics, loading } = useMetrics(queue.name);
  const { hasHistoryProvider = false } = useUIConfig();
  const collapsed = useSettingsStore((state) => state.collapseMetrics);
  const setSettings = useSettingsStore((state) => state.setSettings);
  const [range, setRange] = useState<Range>('60m');

  const now = Date.now();
  const completed = toNativeSeries(metrics?.completed, now);
  const failed = toNativeSeries(metrics?.failed, now);

  const isHistoryRange = range !== '60m';
  const historyEnabled = isHistoryRange && hasHistoryProvider;

  const { from, to } = useRangeWindow(
    range,
    isHistoryRange ? RANGE_DAYS[range as Exclude<Range, '60m'>] : RANGE_DAYS['7d']
  );

  const completedHistory = useHistoryMetrics(
    { queue: queue.name, metric: 'completed', from, to, granularity: 'day' },
    historyEnabled
  );
  const failedHistory = useHistoryMetrics(
    { queue: queue.name, metric: 'failed', from, to, granularity: 'day' },
    historyEnabled
  );

  if (loading && !metrics) {
    return null;
  }

  const hasMetrics = [metrics?.completed, metrics?.failed].some(
    (m) => (m?.meta?.count ?? 0) > 0 || (m?.data?.length ?? 0) > 0
  );

  if (!hasMetrics && !hasHistoryProvider) {
    return (
      <Card className={s.metricsCard}>
        <div className={s.header}>
          <h3 className={s.title}>{t('METRICS.TITLE')}</h3>
        </div>
        <p className={s.empty}>{t('METRICS.EMPTY')}</p>
      </Card>
    );
  }

  const nativeRows = toNativeRows(completed, failed);
  const historyRows = toHistoryRows(completedHistory.points, failedHistory.points);
  const historyLoading = completedHistory.loading || failedHistory.loading;

  const completedRate = completed[NATIVE_WINDOW - 2] ?? 0;
  const failedRate = failed[NATIVE_WINDOW - 2] ?? 0;
  const peak = Math.max(0, ...completed, ...failed);

  const dailyCompletedTotal = sum(historyRows.map((row) => row.completed));
  const dailyFailedTotal = sum(historyRows.map((row) => row.failed));

  return (
    <Card className={s.metricsCard}>
      <MetricsHeader
        collapsed={collapsed}
        onToggle={() => setSettings({ collapseMetrics: !collapsed })}
        hasHistoryProvider={hasHistoryProvider}
        range={range}
        onRangeChange={setRange}
      />
      {!collapsed &&
        (isHistoryRange ? (
          <HistoryMetricsView
            historyRows={historyRows}
            dailyCompletedTotal={dailyCompletedTotal.toLocaleString()}
            dailyFailedTotal={dailyFailedTotal.toLocaleString()}
            loading={historyLoading}
          />
        ) : (
          <NativeMetricsView
            nativeRows={nativeRows}
            completedRate={completedRate}
            failedRate={failedRate}
            peak={peak}
            completed={completed}
            hasMetrics={hasMetrics}
          />
        ))}
    </Card>
  );
};
