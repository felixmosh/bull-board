import { useTranslation } from 'react-i18next';
import { useMetrics } from '../../../hooks/useMetrics';
import { MetricsSummary, StatTile } from '../../MetricsSummary/MetricsSummary';
import { ThroughputAreaChart } from '../../ThroughputAreaChart/ThroughputAreaChart';
import {
  NATIVE_WINDOW,
  sum,
  toNativeRows,
  toNativeSeries,
} from '../../ThroughputAreaChart/throughputSeries';
import s from '../QueueMetrics.module.css';

interface NativeMetricsViewProps {
  queueName: string;
}

export const NativeMetricsView = ({ queueName }: NativeMetricsViewProps) => {
  const { t } = useTranslation();
  const { metrics, loading } = useMetrics(queueName);

  const now = Date.now();
  const completed = toNativeSeries(metrics?.completed, now);
  const failed = toNativeSeries(metrics?.failed, now);

  if (loading && !metrics) {
    return null;
  }

  const hasMetrics = [metrics?.completed, metrics?.failed].some(
    (m) => (m?.meta?.count ?? 0) > 0 || (m?.data?.length ?? 0) > 0
  );

  if (!hasMetrics) {
    return <p className={s.empty}>{t('METRICS.EMPTY')}</p>;
  }

  const nativeRows = toNativeRows(completed, failed);
  const completedRate = completed[NATIVE_WINDOW - 2] ?? 0;
  const failedRate = failed[NATIVE_WINDOW - 2] ?? 0;
  const peak = Math.max(0, ...completed, ...failed);

  return (
    <>
      <MetricsSummary>
        <StatTile
          value={completedRate}
          label={t('METRICS.COMPLETED_PER_MIN')}
          dotColor="var(--completed)"
        />
        <StatTile value={failedRate} label={t('METRICS.FAILED_PER_MIN')} dotColor="var(--failed)" />
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
  );
};
