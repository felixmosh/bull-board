import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { MetricsChartTab } from '../../hooks/useSettings';
import { useSettingsStore } from '../../hooks/useSettings';
import { RangeSelector } from '../RangeSelector/RangeSelector';
import s from './MetricsChartTabs.module.css';

const TABS: MetricsChartTab[] = ['throughput', 'latency'];

const TAB_LABEL_KEYS: Record<MetricsChartTab, 'METRICS.TAB_THROUGHPUT' | 'METRICS.TAB_LATENCY'> = {
  throughput: 'METRICS.TAB_THROUGHPUT',
  latency: 'METRICS.TAB_LATENCY',
};

export interface MetricsChartTabSelectorProps {
  className?: string;
}

/**
 * Segmented control that switches between the throughput and job-latency charts. Lives in the
 * card header next to the range selector, on both the queue detail page and the metrics history
 * page, so the two cannot drift apart. `MetricsChartPane` below renders whichever chart is
 * currently active; both read the same `metricsChartTab` setting, so the header control and the
 * body content stay in sync without prop drilling between them.
 */
export const MetricsChartTabSelector = ({ className }: MetricsChartTabSelectorProps) => {
  const { t } = useTranslation();
  const activeTab = useSettingsStore((state) => state.metricsChartTab);
  const setSettings = useSettingsStore((state) => state.setSettings);

  return (
    <RangeSelector
      ranges={TABS}
      value={activeTab}
      onChange={(tab) => setSettings({ metricsChartTab: tab })}
      getLabel={(tab) => t(TAB_LABEL_KEYS[tab])}
      className={className}
    />
  );
};

export interface MetricsChartPaneProps {
  throughput?: ReactNode;
  latency?: ReactNode;
}

/**
 * Renders whichever of the throughput/latency charts is currently active. The two charts never
 * share a Y axis -- throughput is counts ("104k"), latency is durations ("15m", "30s") -- so
 * side by side their differently-wide axis labels push the plot areas to different x offsets
 * and the shared date ticks never line up. Showing one chart at a time sidesteps that instead
 * of trying to force the axes to match.
 *
 * Falls back to whichever single chart is present when only one is (e.g. no latency provider
 * configured), and renders nothing when neither is.
 */
export const MetricsChartPane = ({ throughput, latency }: MetricsChartPaneProps) => {
  const activeTab = useSettingsStore((state) => state.metricsChartTab);

  if (!throughput && !latency) {
    return null;
  }

  if (!throughput || !latency) {
    return <div className={s.pane}>{throughput ?? latency}</div>;
  }

  return <div className={s.pane}>{activeTab === 'latency' ? latency : throughput}</div>;
};
