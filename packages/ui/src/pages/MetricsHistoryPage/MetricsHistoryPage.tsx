import { Menu } from '@base-ui/react/menu';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { DropdownContent } from '../../components/DropdownContent/DropdownContent';
import { DatabaseIcon } from '../../components/Icons/Database';
import { EllipsisVerticalIcon } from '../../components/Icons/EllipsisVertical';
import { LatencyChart } from '../../components/LatencyChart/LatencyChart';
import { formatDuration } from '../../components/LatencyChart/latencySeries';
import { Loader } from '../../components/Loader/Loader';
import {
  MetricsChartPane,
  MetricsChartTabSelector,
} from '../../components/MetricsChartTabs/MetricsChartTabs';
import { MetricsSummary, StatTile } from '../../components/MetricsSummary/MetricsSummary';
import { RangeSelector } from '../../components/RangeSelector/RangeSelector';
import { ThroughputAreaChart } from '../../components/ThroughputAreaChart/ThroughputAreaChart';
import { sum, toHistoryRows } from '../../components/ThroughputAreaChart/throughputSeries';
import { useHistoryMetrics } from '../../hooks/useHistoryMetrics';
import { useLatencyMetrics } from '../../hooks/useLatencyMetrics';
import { useModal } from '../../hooks/useModal';
import { useQueues } from '../../hooks/useQueues';
import { useRangeWindow } from '../../hooks/useRangeWindow';
import { useSettingsStore } from '../../hooks/useSettings';
import { useUIConfig } from '../../hooks/useUIConfig';
import { HistoryStorageModal } from './HistoryStorageModal';
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

/** Tile totals only ever need the range's overall p95, never a per-bucket series. */
const P95 = [95];

export const MetricsHistoryPage = () => {
  const { t } = useTranslation();
  const { hasHistoryUsage, hasLatencyHistory = false } = useUIConfig();
  const modal = useModal<'storage'>();
  const [range, setRange] = useState<Range>('7d');
  const activeTab = useSettingsStore((state) => state.metricsChartTab);

  const { from, to } = useRangeWindow(range, RANGE_DAYS[range]);

  const { completed, failed, loading } = useHistoryMetrics({ from, to, granularity: 'day' });

  // Only fetched while the latency tab is actually showing, matching the by-queue table's p95
  // column: same mechanism (granularity: 'range', percentiles: [95]), same reason to skip it
  // when the tiles that would show it are not on screen.
  const showLatencyTiles = hasLatencyHistory && activeTab === 'latency';

  const { points: runP95Points } = useLatencyMetrics({
    metric: 'runtime',
    from,
    to,
    granularity: 'range',
    percentiles: P95,
    enabled: showLatencyTiles,
  });
  const { points: waitP95Points } = useLatencyMetrics({
    metric: 'waittime',
    from,
    to,
    granularity: 'range',
    percentiles: P95,
    enabled: showLatencyTiles,
  });
  const p95RunTime = runP95Points[0]?.values['95'];
  const p95WaitTime = waitP95Points[0]?.values['95'];

  const rows = toHistoryRows(completed, failed);

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

  const runs = (totals: QueueTotals) => totals.completed + totals.failed;

  const maxQueueRuns = Math.max(0, ...Object.values(queueTotals).map(runs));

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
      return runs(totalB) - runs(totalA);
    });

  return (
    <section className={s.page}>
      <Card className={s.card}>
        <div className={s.header}>
          <h2 className={s.title}>{t('METRICS_HISTORY.TITLE')}</h2>
          <div className={s.headerActions}>
            {hasLatencyHistory && <MetricsChartTabSelector />}
            <RangeSelector
              ranges={RANGES}
              value={range}
              onChange={setRange}
              getLabel={(r) => t(RANGE_LABEL_KEYS[r])}
            />
            {/* Storage is an occasional maintenance task, so it lives behind the menu
                rather than competing with the range selector for attention. */}
            {hasHistoryUsage && (
              <Menu.Root>
                <Menu.Trigger
                  render={
                    <Button compact aria-label={t('METRICS_HISTORY.ACTIONS')}>
                      <EllipsisVerticalIcon />
                    </Button>
                  }
                />
                <Menu.Portal>
                  <Menu.Positioner align="end" style={{ zIndex: 100 }}>
                    <DropdownContent>
                      <Menu.Item className={s.menuItem} onClick={() => modal.open('storage')}>
                        <DatabaseIcon />
                        {t('METRICS_HISTORY.STORAGE.TITLE')}
                      </Menu.Item>
                    </DropdownContent>
                  </Menu.Positioner>
                </Menu.Portal>
              </Menu.Root>
            )}
          </div>
        </div>

        {loading && rows.length === 0 ? (
          <Loader />
        ) : rows.length === 0 ? (
          <p className={s.empty}>{t('METRICS_HISTORY.EMPTY')}</p>
        ) : showLatencyTiles ? (
          <MetricsSummary>
            <StatTile
              value={
                p95RunTime !== undefined
                  ? formatDuration(p95RunTime)
                  : t('METRICS_HISTORY.NOT_AVAILABLE')
              }
              label={t('METRICS_HISTORY.P95_RUN_TIME')}
              dotColor="var(--latency-run-p95)"
              valueClassName={s.statValue}
            />
            <StatTile
              value={
                p95WaitTime !== undefined
                  ? formatDuration(p95WaitTime)
                  : t('METRICS_HISTORY.NOT_AVAILABLE')
              }
              label={t('METRICS_HISTORY.P95_WAIT_TIME')}
              dotColor="var(--latency-wait-p95)"
              valueClassName={s.statValue}
            />
          </MetricsSummary>
        ) : (
          <MetricsSummary>
            <StatTile
              value={totalCompleted.toLocaleString()}
              label={t('METRICS_HISTORY.TOTAL_COMPLETED')}
              dotColor="var(--status-completed)"
              valueClassName={s.statValue}
            />
            <StatTile
              value={totalFailed.toLocaleString()}
              label={t('METRICS_HISTORY.TOTAL_FAILED')}
              dotColor="var(--status-failed)"
              valueClassName={s.statValue}
            />
          </MetricsSummary>
        )}

        <MetricsChartPane
          throughput={
            rows.length > 0 ? (
              <ThroughputAreaChart
                idPrefix="global-history"
                data={rows}
                height={260}
                showAxis
                granularity="day"
                formatXTick={(x) =>
                  new Date(x).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                }
                formatTooltipLabel={(row) => new Date(row.x).toLocaleDateString()}
              />
            ) : undefined
          }
          latency={
            hasLatencyHistory ? (
              <LatencyChart
                from={from}
                to={to}
                granularity="day"
                idPrefix="global-latency"
                height={260}
              />
            ) : undefined
          }
        />

        {sortedQueueNames.length > 0 && (
          <div className={s.tableWrapper}>
            <h3 className={s.subtitle}>{t('METRICS_HISTORY.BY_QUEUE')}</h3>
            <div className={s.tableScroll}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th className={s.thQueue}>{t('METRICS_HISTORY.QUEUE')}</th>
                    <th className={s.thBar}>{t('METRICS_HISTORY.RUNS')}</th>
                    <th className={s.thNumeric}>{t('METRICS_HISTORY.COMPLETED')}</th>
                    <th className={s.thFailed}>{t('METRICS_HISTORY.FAILED')}</th>
                    {hasLatencyHistory && (
                      <th className={s.thNumeric}>{t('METRICS_HISTORY.P95_RUNTIME')}</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {sortedQueueNames.map((queueName) => (
                    <QueueThroughputRow
                      key={queueName}
                      queueName={queueName}
                      from={from}
                      to={to}
                      maxTotal={maxQueueRuns}
                      onTotals={handleQueueTotals}
                      hasLatencyHistory={hasLatencyHistory}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      {modal.isMounted('storage') && (
        <HistoryStorageModal
          open={modal.isOpen('storage')}
          from={from}
          rangeLabel={t(RANGE_LABEL_KEYS[range])}
          onClose={modal.close('storage')}
        />
      )}
    </section>
  );
};
