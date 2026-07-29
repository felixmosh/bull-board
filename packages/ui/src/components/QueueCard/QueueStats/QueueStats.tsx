import type { AppQueue, Status } from '@bull-board/api/typings/app';
import cn from 'clsx';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { dynamicTranslationKey } from '../../../utils/dynamicTranslationKey';
import { links } from '../../../utils/links';
import { toCamelCase } from '../../../utils/toCamelCase';
import s from './QueueStats.module.css';

interface IQueueStatsProps {
  queue: AppQueue;
}

const BACKLOG_STATUSES: Status[] = [
  'waiting',
  'waiting-children',
  'prioritized',
  'delayed',
  'paused',
];

export const QueueStats = ({ queue }: IQueueStatsProps) => {
  const { t } = useTranslation();
  const total = queue.statuses.reduce((result, status) => result + (queue.counts[status] || 0), 0);
  const nonZeroStatuses = queue.statuses.filter((status) => queue.counts[status] > 0);
  const backlog = BACKLOG_STATUSES.reduce((sum, status) => sum + (queue.counts[status] || 0), 0);
  const active = queue.counts.active || 0;
  const failed = queue.counts.failed || 0;

  return (
    <div className={s.stats}>
      <div className={s.pulse}>
        {total === 0 ? (
          <span className={s.emptyBar} />
        ) : (
          nonZeroStatuses.map((status) => {
            const value = queue.counts[status];

            return (
              <Link
                to={links.queuePage(queue.name, { [queue.name]: status })}
                key={status}
                role="progressbar"
                style={{ width: `${(value / total) * 100}%` }}
                aria-valuenow={value}
                aria-valuemin={0}
                aria-valuemax={total}
                className={cn(s[toCamelCase(status)], s.bar)}
                title={`${t(dynamicTranslationKey(`QUEUE.STATUS.${status.toUpperCase()}`))}: ${value}`}
              />
            );
          })
        )}
      </div>
      <div className={s.statRow}>
        <Link to={links.queuePage(queue.name, { [queue.name]: 'active' })} className={s.statItem}>
          <span className={s.statLabel}>{t('DASHBOARD.SUMMARY.ACTIVE')}</span>
          <span className={s.statValue}>{active}</span>
        </Link>
        <Link to={links.queuePage(queue.name, { [queue.name]: 'waiting' })} className={s.statItem}>
          <span className={s.statLabel}>{t('DASHBOARD.SUMMARY.BACKLOG')}</span>
          <span className={s.statValue}>{backlog}</span>
        </Link>
        <Link to={links.queuePage(queue.name, { [queue.name]: 'failed' })} className={s.statItem}>
          <span className={s.statLabel}>{t('DASHBOARD.SUMMARY.FAILED')}</span>
          <span className={cn(s.statValue, { [s.statValueFailed]: failed > 0 })}>{failed}</span>
        </Link>
        <span className={s.total}>{t('DASHBOARD.JOBS_COUNT', { count: total })}</span>
      </div>
    </div>
  );
};
