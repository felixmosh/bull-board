import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { sum } from '../../components/ThroughputAreaChart/throughputSeries';
import { Tooltip } from '../../components/Tooltip/Tooltip';
import { useHistoryMetrics } from '../../hooks/useHistoryMetrics';
import s from './MetricsHistoryPage.module.css';

/** Percent of the track below which a non-zero segment would round away to nothing. */
const MIN_SEGMENT = 1;

export interface QueueTotals {
  completed: number;
  failed: number;
}

export interface QueueThroughputRowProps {
  queueName: string;
  from: number;
  to: number;
  /** Runs of the busiest queue in the range; every bar is scaled against it. */
  maxTotal: number;
  onTotals: (queueName: string, totals: QueueTotals) => void;
}

const formatRate = (rate: number): string => {
  if (rate > 0 && rate < 0.1) {
    return '<0.1%';
  }
  return `${rate.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
};

export const QueueThroughputRow = ({
  queueName,
  from,
  to,
  maxTotal,
  onTotals,
}: QueueThroughputRowProps) => {
  const { t } = useTranslation();
  const { completed, failed, loading } = useHistoryMetrics({
    queue: queueName,
    from,
    to,
    granularity: 'day',
  });

  const totalCompleted = sum(completed.map((point) => point.value));
  const totalFailed = sum(failed.map((point) => point.value));
  const total = totalCompleted + totalFailed;

  useEffect(() => {
    if (!loading) {
      onTotals(queueName, { completed: totalCompleted, failed: totalFailed });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueName, loading, totalCompleted, totalFailed]);

  const scale = maxTotal > 0 ? 100 / maxTotal : 0;
  const segment = (value: number) => (value > 0 ? Math.max(value * scale, MIN_SEGMENT) : 0);
  const completedSegment = segment(totalCompleted);
  const failedSegment = segment(totalFailed);
  const failureRate = total > 0 ? (totalFailed / total) * 100 : 0;

  const barLabel = t('METRICS_HISTORY.BAR_LABEL', {
    completed: totalCompleted.toLocaleString(),
    failed: totalFailed.toLocaleString(),
  });

  return (
    <tr className={s.tableRow}>
      <td className={s.tableCellQueue}>{queueName}</td>
      <td className={s.barCell}>
        {loading ? (
          <span className={s.track} />
        ) : (
          <Tooltip title={barLabel} className={s.barTooltip}>
            {/* Hidden, not labelled: the tooltip and the two cells beside it
                already announce these numbers. */}
            <span className={s.track} aria-hidden="true">
              <span className={s.bar}>
                <span
                  className={s.fillCompleted}
                  style={{ transform: `scaleX(${completedSegment / 100})` }}
                />
                <span
                  className={s.fillFailed}
                  style={{
                    transform: `translateX(${completedSegment}%) scaleX(${failedSegment / 100})`,
                  }}
                />
              </span>
            </span>
          </Tooltip>
        )}
      </td>
      <td className={s.tableCellNumeric}>{loading ? '…' : totalCompleted.toLocaleString()}</td>
      <td className={s.tableCellNumeric}>
        <span className={s.failedCell}>
          <span className={totalFailed > 0 ? s.failedValue : s.zeroValue}>
            {loading ? '…' : totalFailed.toLocaleString()}
          </span>
          {totalFailed > 0 && (
            <Tooltip
              title={t('METRICS_HISTORY.FAILURE_RATE', { rate: formatRate(failureRate) })}
              className={s.failureRate}
            >
              {formatRate(failureRate)}
            </Tooltip>
          )}
        </span>
      </td>
    </tr>
  );
};
