import type { AppQueue } from '@bull-board/api/typings/app';
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSettingsStore } from '../../hooks/useSettings';
import { useUIConfig } from '../../hooks/useUIConfig';
import { Card } from '../Card/Card';
import { HistoryMetricsView } from './HistoryMetricsView/HistoryMetricsView';
import { MetricsHeader } from './MetricsHeader/MetricsHeader';
import { NativeMetricsView } from './NativeMetricsView/NativeMetricsView';
import s from './QueueMetrics.module.css';

interface QueueMetricsProps {
  queue: AppQueue;
}

export type Range = '60m' | '7d' | '30d' | '90d';

export const QueueMetrics = ({ queue }: QueueMetricsProps) => {
  const { hasHistoryProvider = false, hasLatencyHistory = false } = useUIConfig();
  const { collapseMetrics: collapsed, setSettings } = useSettingsStore(
    useShallow((state) => ({
      collapseMetrics: state.collapseMetrics,
      setSettings: state.setSettings,
    }))
  );
  const [range, setRange] = useState<Range>('60m');

  const historyEnabled = range !== '60m' && hasHistoryProvider;
  // Not gated on `historyEnabled` / range: the tab control must stay visible and stable across
  // every range, including 60m, so it never disappears as the user switches ranges. NativeMetricsView
  // handles what "latency selected at 60m" actually renders (an explanation, not an empty chart).
  const showChartTabs = hasHistoryProvider && hasLatencyHistory;

  return (
    <Card className={s.metricsCard}>
      <MetricsHeader
        collapsed={collapsed}
        onToggle={() => setSettings({ collapseMetrics: !collapsed })}
        showRangeSelector={hasHistoryProvider}
        range={range}
        onRangeChange={setRange}
        showChartTabs={showChartTabs}
      />
      {!collapsed &&
        (historyEnabled ? (
          <HistoryMetricsView queueName={queue.name} range={range} />
        ) : (
          <NativeMetricsView queueName={queue.name} showChartTabs={showChartTabs} />
        ))}
    </Card>
  );
};
