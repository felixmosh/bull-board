import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../../hooks/useSettings';
import { ChevronDown } from '../../Icons/ChevronDown';
import { MetricsChartTabSelector } from '../../MetricsChartTabs/MetricsChartTabs';
import { RangeSelector } from '../../RangeSelector/RangeSelector';
import type { Range } from '../QueueMetrics';
import parentStyles from '../QueueMetrics.module.css';
import s from './MetricsHeader.module.css';

const RANGES: Range[] = ['60m', '7d', '30d', '90d'];

const RANGE_LABEL_KEYS: Record<
  Range,
  'METRICS.RANGE_60M' | 'METRICS.RANGE_7D' | 'METRICS.RANGE_30D' | 'METRICS.RANGE_90D'
> = {
  '60m': 'METRICS.RANGE_60M',
  '7d': 'METRICS.RANGE_7D',
  '30d': 'METRICS.RANGE_30D',
  '90d': 'METRICS.RANGE_90D',
};

interface MetricsHeaderProps {
  collapsed: boolean;
  onToggle: () => void;
  showRangeSelector: boolean;
  range: Range;
  onRangeChange: (range: Range) => void;
  /** Whether the throughput/latency tab control has anything to switch between -- a history
   *  provider with latency configured. True regardless of range, including 60m: the control
   *  must stay visible and stable across every range rather than disappearing on 60m, where
   *  native metrics have no latency chart. NativeMetricsView renders an explanation instead of
   *  an empty chart when latency is selected in that mode. */
  showChartTabs: boolean;
}

export const MetricsHeader = ({
  collapsed,
  onToggle,
  showRangeSelector,
  range,
  onRangeChange,
  showChartTabs,
}: MetricsHeaderProps) => {
  const { t } = useTranslation();
  const activeTab = useSettingsStore((state) => state.metricsChartTab);
  const isLatencyView = showChartTabs && activeTab === 'latency';

  return (
    <div className={parentStyles.header}>
      <button
        type="button"
        className={s.collapseToggle}
        aria-expanded={!collapsed}
        onClick={onToggle}
        title={collapsed ? t('METRICS.SHOW') : t('METRICS.HIDE')}
      >
        <span className={s.chevronChip}>
          <ChevronDown className={collapsed ? s.chevronCollapsed : s.chevron} />
        </span>
        <h3 className={parentStyles.title}>
          {t(isLatencyView ? 'LATENCY.TITLE' : 'METRICS.TITLE')}
        </h3>
      </button>
      {!collapsed && (showChartTabs || showRangeSelector) && (
        <div className={s.headerActions}>
          {showChartTabs && <MetricsChartTabSelector className={s.control} />}
          {showRangeSelector && (
            <RangeSelector
              ranges={RANGES}
              value={range}
              onChange={onRangeChange}
              getLabel={(r) => t(RANGE_LABEL_KEYS[r])}
              className={s.control}
            />
          )}
        </div>
      )}
    </div>
  );
};
