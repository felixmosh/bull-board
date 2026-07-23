import type { AppQueue } from '@bull-board/api/typings/app';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMetrics } from '../../hooks/useMetrics';
import { useSettingsStore } from '../../hooks/useSettings';
import { useUIConfig } from '../../hooks/useUIConfig';
import { Card } from '../Card/Card';
import {
  NATIVE_WINDOW,
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

  const historyEnabled = range !== '60m' && hasHistoryProvider;

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
  const completedRate = completed[NATIVE_WINDOW - 2] ?? 0;
  const failedRate = failed[NATIVE_WINDOW - 2] ?? 0;
  const peak = Math.max(0, ...completed, ...failed);

  return (
    <Card className={s.metricsCard}>
      <MetricsHeader
        collapsed={collapsed}
        onToggle={() => setSettings({ collapseMetrics: !collapsed })}
        showRangeSelector={hasHistoryProvider}
        range={range}
        onRangeChange={setRange}
      />
      {!collapsed &&
        (historyEnabled ? (
          <HistoryMetricsView queueName={queue.name} range={range} />
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
