import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card/Card';
import { Loader } from '../../components/Loader/Loader';
import { MetricsSummary, StatTile } from '../../components/MetricsSummary/MetricsSummary';
import { RangeSelector } from '../../components/RangeSelector/RangeSelector';
import { ThroughputAreaChart } from '../../components/ThroughputAreaChart/ThroughputAreaChart';
import { sum, toHistoryRows } from '../../components/ThroughputAreaChart/throughputSeries';
import { useHistoryMetrics } from '../../hooks/useHistoryMetrics';
import { useQueues } from '../../hooks/useQueues';
import { useRangeWindow } from '../../hooks/useRangeWindow';
import { HistoryStorage } from './HistoryStorage';
import { QueueThroughputRow, QueueTotals } from './QueueThroughputRow';
import s from './MetricsHistoryPage.module.css';

type Range = '7d' | '30d' | '90d';

const RANGES: Range[] = ['7d', '30d', '90d'];

const RANGE_LABEL_KEYS: Record<
  Range,
  'METRICS_HISTORY.RANGE_7D' | 'METRICS_HISTORY.RANGE_30D' | 'METRICS_HISTORY.RANGE_90D'
> = {
  '7d': 'METRICS_HISTORY.RANGE_7D',
  '30d': 'METRICS_HISTORY.RANGE_30D',
  '90d': 'METRICS_HISTORY.RANGE_90D',
};

const RANGE_DAYS: Record<Range, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

export const MetricsHistoryPage = () => {
  const { t } = useTranslation();
  const [range, setRange] = useState<Range>('7d');

  const { from, to } = useRangeWindow(range, RANGE_DAYS[range]);

  const completed = useHistoryMetrics({ metric: 'completed', from, to, granularity: 'day' }, true);
  const failed = useHistoryMetrics({ metric: 'failed', from, to, granularity: 'day' }, true);

  const rows = toHistoryRows(completed.points, failed.points);
  const loading = completed.loading || failed.loading;

  const totalCompleted = sum(rows.map((row) => row.completed));
  const totalFailed = sum(rows.map((row) => row.failed));

  const { queues } = useQueues();
  const [queueTotals, setQueueTotals] = useState<Record<string, QueueTotals>>({});

  useEffect(() => {
    setQueueTotals({});
  }, [range]);

  const handleQueueTotals = useCallback((queueName: string, totals: QueueTotals) => {
    setQueueTotals((prev) => {
      const existing = prev[queueName];
      if (
        existing &&
        existing.completed === totals.completed &&
        existing.failed === totals.failed
      ) {
        return prev;
      }
      return { ...prev, [queueName]: totals };
    });
  }, []);

  const maxQueueCompleted = Math.max(
    0,
    ...Object.values(queueTotals).map((total) => total.completed)
  );

  const sortedQueueNames = (queues ?? [])
    .map((queue) => queue.name)
    .sort((a, b) => {
      const totalA = queueTotals[a];
      const totalB = queueTotals[b];
      if (!totalA && !totalB) {
        return a.localeCompare(b);
      }
      if (!totalA) {
        return 1;
      }
      if (!totalB) {
        return -1;
      }
      return totalB.completed - totalA.completed;
    });

  return (
    <section className={s.page}>
      <Card className={s.card}>
        <div className={s.header}>
          <h2 className={s.title}>{t('METRICS_HISTORY.TITLE')}</h2>
          <RangeSelector
            ranges={RANGES}
            value={range}
            onChange={setRange}
            getLabel={(r) => t(RANGE_LABEL_KEYS[r])}
          />
        </div>

        {loading && rows.length === 0 ? (
          <Loader />
        ) : rows.length === 0 ? (
          <p className={s.empty}>{t('METRICS_HISTORY.EMPTY')}</p>
        ) : (
          <>
            <MetricsSummary>
              <StatTile
                value={totalCompleted.toLocaleString()}
                label={t('METRICS_HISTORY.TOTAL_COMPLETED')}
                dotColor="var(--completed)"
                valueClassName={s.statValue}
              />
              <StatTile
                value={totalFailed.toLocaleString()}
                label={t('METRICS_HISTORY.TOTAL_FAILED')}
                dotColor="var(--failed)"
                valueClassName={s.statValue}
              />
            </MetricsSummary>
            <ThroughputAreaChart
              idPrefix="global-history"
              data={rows}
              height={260}
              showAxis
              formatXTick={(x) =>
                new Date(x).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
              }
              formatTooltipLabel={(row) => new Date(row.x).toLocaleDateString()}
            />
          </>
        )}

        {sortedQueueNames.length > 0 && (
          <div className={s.tableWrapper}>
            <h3 className={s.subtitle}>{t('METRICS_HISTORY.BY_QUEUE')}</h3>
            <table className={s.table}>
              <thead>
                <tr>
                  <th className={s.thQueue}>{t('METRICS_HISTORY.QUEUE')}</th>
                  <th className={s.thCompleted}>{t('METRICS_HISTORY.COMPLETED')}</th>
                  <th className={s.thNumeric}>{t('METRICS_HISTORY.FAILED')}</th>
                </tr>
              </thead>
              <tbody>
                {sortedQueueNames.map((queueName) => (
                  <QueueThroughputRow
                    key={queueName}
                    queueName={queueName}
                    from={from}
                    to={to}
                    maxCompleted={maxQueueCompleted}
                    onTotals={handleQueueTotals}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <HistoryStorage from={from} rangeLabel={t(RANGE_LABEL_KEYS[range])} />
      </Card>
    </section>
  );
};
