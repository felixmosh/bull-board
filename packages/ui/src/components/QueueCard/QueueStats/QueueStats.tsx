import type { AppQueue, Status } from '@bull-board/api/typings/app';
import cn from 'clsx';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useSearchParams } from '../../../hooks/useSearchParams';
import { dynamicTranslationKey } from '../../../utils/dynamicTranslationKey';
import { links } from '../../../utils/links';
import { toCamelCase } from '../../../utils/toCamelCase';
import { HoverPanel } from '../../HoverPanel/HoverPanel';
import s from './QueueStats.module.css';

interface IQueueStatsProps {
  queue: AppQueue;
}

export const QueueStats = ({ queue }: IQueueStatsProps) => {
  const { t } = useTranslation();
  const total = queue.statuses.reduce((result, status) => result + (queue.counts[status] || 0), 0);
  const nonZeroStatuses = queue.statuses.filter((status) => (queue.counts[status] ?? 0) > 0);
  const { status: selectedStatus } = useSearchParams();
  const flagStatuses = [
    ...new Set<Status>(selectedStatus ? [selectedStatus, 'failed'] : ['active', 'failed']),
  ].filter((status) => (queue.counts[status] ?? 0) > 0);
  const jobsLabel = t('DASHBOARD.JOBS_COUNT', { count: total });

  /* The queue pulse: proportional per-status composition of the queue. */
  const pulse = (
    <span className={s.pulse}>
      {total === 0 ? (
        <span className={s.emptyBar} />
      ) : (
        nonZeroStatuses.map((status) => (
          <span
            key={status}
            style={{ width: `${((queue.counts[status] ?? 0) / total) * 100}%` }}
            className={cn(s[toCamelCase(status)], s.bar)}
          />
        ))
      )}
    </span>
  );

  return (
    <div className={s.stats}>
      {total === 0 ? (
        <div className={s.pulseStatic}>{pulse}</div>
      ) : (
        <HoverPanel
          triggerLabel={jobsLabel}
          rows={nonZeroStatuses.map((status) => ({
            id: status,
            color: `var(--status-${status})`,
            label: t(dynamicTranslationKey(`QUEUE.STATUS.${status.toUpperCase()}`)),
            value: (queue.counts[status] ?? 0).toLocaleString(),
            to: links.queuePage(queue.name, { [queue.name]: status }),
          }))}
        >
          {pulse}
        </HoverPanel>
      )}
      <div className={s.footer}>
        {flagStatuses.map((status) => (
          <Link
            key={status}
            to={links.queuePage(queue.name, { [queue.name]: status })}
            className={cn(s.flag, status === 'failed' && s.flagAlert)}
            style={{ '--flag-color': `var(--status-${status})` } as CSSProperties}
          >
            <span className={s.flagDot} />
            {t(dynamicTranslationKey(`QUEUE.STATUS.${status.toUpperCase()}`))}
            <span className={s.flagCount}>{(queue.counts[status] ?? 0).toLocaleString()}</span>
          </Link>
        ))}
        <span className={s.total}>{jobsLabel}</span>
      </div>
    </div>
  );
};
