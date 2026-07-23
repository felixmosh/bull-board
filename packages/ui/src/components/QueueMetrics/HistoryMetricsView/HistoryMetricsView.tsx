import { useTranslation } from 'react-i18next';
import { MetricsSummary, StatTile } from '../../MetricsSummary/MetricsSummary';
import { ThroughputAreaChart } from '../../ThroughputAreaChart/ThroughputAreaChart';
import type { ThroughputRow } from '../../ThroughputAreaChart/throughputSeries';
import s from '../QueueMetrics.module.css';

interface HistoryMetricsViewProps {
  historyRows: ThroughputRow[];
  dailyCompletedTotal: string;
  dailyFailedTotal: string;
  loading: boolean;
}

export const HistoryMetricsView = ({
  historyRows,
  dailyCompletedTotal,
  dailyFailedTotal,
  loading,
}: HistoryMetricsViewProps) => {
  const { t } = useTranslation();

  if (!loading && historyRows.length === 0) {
    return <p className={s.empty}>{t('METRICS.HISTORY_EMPTY')}</p>;
  }

  return (
    <>
      <MetricsSummary>
        <StatTile
          value={dailyCompletedTotal}
          label={t('METRICS.DAILY_COMPLETED')}
          dotColor="var(--completed)"
        />
        <StatTile
          value={dailyFailedTotal}
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
  );
};
