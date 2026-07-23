import { useTranslation } from 'react-i18next';
import { MetricsSummary, StatTile } from '../../MetricsSummary/MetricsSummary';
import { ThroughputAreaChart } from '../../ThroughputAreaChart/ThroughputAreaChart';
import { NATIVE_WINDOW, sum } from '../../ThroughputAreaChart/throughputSeries';
import type { ThroughputRow } from '../../ThroughputAreaChart/throughputSeries';
import s from '../QueueMetrics.module.css';

interface NativeMetricsViewProps {
  nativeRows: ThroughputRow[];
  completedRate: number;
  failedRate: number;
  peak: number;
  completed: number[];
  hasMetrics: boolean;
}

export const NativeMetricsView = ({
  nativeRows,
  completedRate,
  failedRate,
  peak,
  completed,
  hasMetrics,
}: NativeMetricsViewProps) => {
  const { t } = useTranslation();

  if (!hasMetrics) {
    return <p className={s.empty}>{t('METRICS.EMPTY')}</p>;
  }

  return (
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
  );
};
