import type { AppQueue, Status } from '@bull-board/api/typings/app';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StatTile } from '../MetricsSummary/MetricsSummary';
import s from './OverviewSummary.module.css';

interface OverviewSummaryProps {
  queues: AppQueue[];
}

const BACKLOG_STATUSES: Status[] = [
  'waiting',
  'waiting-children',
  'prioritized',
  'delayed',
  'paused',
];

export const OverviewSummary = ({ queues }: OverviewSummaryProps) => {
  const { t } = useTranslation();

  const totals = useMemo(
    () =>
      queues.reduce(
        (acc, queue) => {
          acc.active += queue.counts.active || 0;
          acc.failed += queue.counts.failed || 0;
          for (const status of BACKLOG_STATUSES) {
            acc.backlog += queue.counts[status] || 0;
          }
          for (const status of queue.statuses) {
            acc.jobs += queue.counts[status] || 0;
          }
          return acc;
        },
        { jobs: 0, active: 0, backlog: 0, failed: 0 }
      ),
    [queues]
  );

  return (
    <div className={s.summary}>
      <StatTile value={queues.length} label={t('DASHBOARD.SUMMARY.QUEUES')} />
      <StatTile value={totals.jobs} label={t('DASHBOARD.SUMMARY.JOBS')} />
      <StatTile
        value={totals.active}
        label={t('DASHBOARD.SUMMARY.ACTIVE')}
        dotColor="var(--status-active)"
      />
      <StatTile
        value={totals.backlog}
        label={t('DASHBOARD.SUMMARY.BACKLOG')}
        dotColor="var(--status-waiting)"
      />
      <StatTile
        value={totals.failed}
        label={t('DASHBOARD.SUMMARY.FAILED')}
        dotColor="var(--status-failed)"
      />
    </div>
  );
};
