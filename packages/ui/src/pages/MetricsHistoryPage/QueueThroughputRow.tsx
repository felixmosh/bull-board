import { useEffect } from 'react';
import { sum } from '../../components/ThroughputAreaChart/throughputSeries';
import { useHistoryMetrics } from '../../hooks/useHistoryMetrics';
import s from './MetricsHistoryPage.module.css';

export interface QueueTotals {
  completed: number;
  failed: number;
}

export interface QueueThroughputRowProps {
  queueName: string;
  from: number;
  to: number;
  maxCompleted: number;
  onTotals: (queueName: string, totals: QueueTotals) => void;
}

export const QueueThroughputRow = ({
  queueName,
  from,
  to,
  maxCompleted,
  onTotals,
}: QueueThroughputRowProps) => {
  const completed = useHistoryMetrics({
    queue: queueName,
    metric: 'completed',
    from,
    to,
    granularity: 'day',
  });
  const failed = useHistoryMetrics({
    queue: queueName,
    metric: 'failed',
    from,
    to,
    granularity: 'day',
  });

  const loading = completed.loading || failed.loading;
  const totalCompleted = sum(completed.points.map((point) => point.value));
  const totalFailed = sum(failed.points.map((point) => point.value));

  useEffect(() => {
    if (!loading) {
      onTotals(queueName, { completed: totalCompleted, failed: totalFailed });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueName, loading, totalCompleted, totalFailed]);

  const barWidth = maxCompleted > 0 ? Math.round((totalCompleted / maxCompleted) * 100) : 0;

  return (
    <tr className={s.tableRow}>
      <td className={s.tableCellQueue}>{queueName}</td>
      <td className={s.completedCell}>
        {loading ? (
          <span className={s.num}>…</span>
        ) : (
          <div className={s.completedInner}>
            <span className={s.num}>{totalCompleted.toLocaleString()}</span>
            <span className={s.track} aria-hidden="true">
              <span className={s.fill} style={{ width: `${barWidth}%` }} />
            </span>
          </div>
        )}
      </td>
      <td className={s.tableCellNumeric}>
        {loading ? (
          '…'
        ) : (
          <span className={totalFailed > 0 ? s.failedValue : undefined}>
            {totalFailed.toLocaleString()}
          </span>
        )}
      </td>
    </tr>
  );
};
