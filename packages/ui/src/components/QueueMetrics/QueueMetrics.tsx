import type { AppQueue } from '@bull-board/api/typings/app';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHistoryMetrics } from '../../hooks/useHistoryMetrics';
import { useMetrics } from '../../hooks/useMetrics';
import { useRangeWindow } from '../../hooks/useRangeWindow';
import { useSettingsStore } from '../../hooks/useSettings';
import { useUIConfig } from '../../hooks/useUIConfig';
import { Card } from '../Card/Card';
import { ChevronDown } from '../Icons/ChevronDown';
import { MetricsSummary, StatTile } from '../MetricsSummary/MetricsSummary';
import { RangeSelector } from '../RangeSelector/RangeSelector';
import { ThroughputAreaChart } from '../ThroughputAreaChart/ThroughputAreaChart';
import {
  NATIVE_WINDOW,
  sum,
  toHistoryRows,
  toNativeRows,
  toNativeSeries,
} from '../ThroughputAreaChart/throughputSeries';
import s from './QueueMetrics.module.css';

interface QueueMetricsProps {
  queue: AppQueue;
}

type Range = '60m' | '7d' | '30d' | '90d';

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

  // An empty native buffer doesn't mean there's nothing to show: recorded history
  // outlives it, so with a provider configured the card still has to render its range
  // selector. Otherwise a worker restart, or metrics being switched off after some
  // history was recorded, would strand data the user can no longer reach from here.
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
  const historyEmpty = !historyLoading && historyRows.length === 0;

  const completedRate = completed[NATIVE_WINDOW - 2] ?? 0;
  const failedRate = failed[NATIVE_WINDOW - 2] ?? 0;
  const peak = Math.max(0, ...completed, ...failed);

  const dailyCompletedTotal = sum(historyRows.map((row) => row.completed));
  const dailyFailedTotal = sum(historyRows.map((row) => row.failed));

  return (
    <Card className={s.metricsCard}>
      <div className={s.header}>
        <button
          type="button"
          className={s.collapseToggle}
          aria-expanded={!collapsed}
          onClick={() => setSettings({ collapseMetrics: !collapsed })}
          title={collapsed ? t('METRICS.SHOW') : t('METRICS.HIDE')}
        >
          <span className={s.chevronChip}>
            <ChevronDown className={collapsed ? s.chevronCollapsed : s.chevron} />
          </span>
          <h3 className={s.title}>{t('METRICS.TITLE')}</h3>
        </button>
        {!collapsed && (
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
        )}
        {!collapsed && hasHistoryProvider && (
          <RangeSelector
            ranges={RANGES}
            value={range}
            onChange={setRange}
            getLabel={(r) => t(RANGE_LABEL_KEYS[r])}
          />
        )}
      </div>

      {!collapsed && !isHistoryRange && !hasMetrics && (
        <p className={s.empty}>{t('METRICS.EMPTY')}</p>
      )}

      {!collapsed && !isHistoryRange && hasMetrics && (
        <>
          <MetricsSummary>
            <StatTile
              value={completedRate}
              label={t('METRICS.COMPLETED_PER_MIN')}
              dotColor="var(--completed)"
            />
            <StatTile
              value={failedRate}
              label={t('METRICS.FAILED_PER_MIN')}
              dotColor="var(--failed)"
            />
            <StatTile value={peak} label={t('METRICS.PEAK_PER_MIN')} />
            <StatTile
              value={sum(completed)}
              label={t('METRICS.WINDOW_COMPLETED', { minutes: NATIVE_WINDOW })}
            />
          </MetricsSummary>

          <ThroughputAreaChart
            idPrefix="queue-native"
            data={nativeRows}
            height={180}
            showAxis
            formatXTick={(x) =>
              x === NATIVE_WINDOW - 1 ? t('METRICS.NOW') : `${NATIVE_WINDOW - 1 - x}m`
            }
            formatTooltipLabel={(row) =>
              row.x === NATIVE_WINDOW - 1
                ? t('METRICS.NOW')
                : t('METRICS.MINUTES_AGO', { minutes: NATIVE_WINDOW - 1 - row.x })
            }
            valueUnit={t('METRICS.PER_MIN_UNIT')}
          />
        </>
      )}

      {!collapsed && isHistoryRange && historyEmpty && (
        <p className={s.empty}>{t('METRICS.HISTORY_EMPTY')}</p>
      )}

      {!collapsed && isHistoryRange && !historyEmpty && (
        <>
          <MetricsSummary>
            <StatTile
              value={dailyCompletedTotal.toLocaleString()}
              label={t('METRICS.DAILY_COMPLETED')}
              dotColor="var(--completed)"
            />
            <StatTile
              value={dailyFailedTotal.toLocaleString()}
              label={t('METRICS.DAILY_FAILED')}
              dotColor="var(--failed)"
            />
          </MetricsSummary>

          <ThroughputAreaChart
            idPrefix="queue-history"
            data={historyRows}
            height={180}
            showAxis
            formatXTick={(x) =>
              new Date(x).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
            }
            formatTooltipLabel={(row) => new Date(row.x).toLocaleDateString()}
          />
        </>
      )}
    </Card>
  );
};
