import { useTranslation } from 'react-i18next';
import { useHistoryMetrics } from '../../../hooks/useHistoryMetrics';
import { useRangeWindow } from '../../../hooks/useRangeWindow';
import { MetricsSummary, StatTile } from '../../MetricsSummary/MetricsSummary';
import { ThroughputAreaChart } from '../../ThroughputAreaChart/ThroughputAreaChart';
import { sum, toHistoryRows } from '../../ThroughputAreaChart/throughputSeries';
import type { Range } from '../QueueMetrics';
import s from '../QueueMetrics.module.css';

const RANGE_DAYS: Record<Exclude<Range, '60m'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

interface HistoryMetricsViewProps {
  queueName: string;
  range: Range;
}

export const HistoryMetricsView = ({ queueName, range }: HistoryMetricsViewProps) => {
  const { t } = useTranslation();

  const { from, to } = useRangeWindow(range, RANGE_DAYS[range as Exclude<Range, '60m'>]);

  const completedHistory = useHistoryMetrics({
    queue: queueName,
    metric: 'completed',
    from,
    to,
    granularity: 'day',
  });
  const failedHistory = useHistoryMetrics({
    queue: queueName,
    metric: 'failed',
    from,
    to,
    granularity: 'day',
  });

  const rows = toHistoryRows(completedHistory.points, failedHistory.points);
  const loading = completedHistory.loading || failedHistory.loading;

  if (rows.length === 0) {
    return <p className={s.empty}>{t('METRICS.HISTORY_EMPTY')}</p>;
  }

  if (loading) {
    return null;
  }

  const dailyCompletedTotal = sum(rows.map((row) => row.completed)).toLocaleString();
  const dailyFailedTotal = sum(rows.map((row) => row.failed)).toLocaleString();

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
        data={rows}
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
