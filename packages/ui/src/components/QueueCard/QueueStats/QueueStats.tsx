import type { AppQueue } from '@bull-board/api/typings/app';
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

export const QueueStats = ({ queue }: IQueueStatsProps) => {
  const { t } = useTranslation();
  const total = queue.statuses.reduce((result, status) => result + (queue.counts[status] || 0), 0);
  const nonZeroStatuses = queue.statuses.filter((status) => queue.counts[status] > 0);

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
                title={t(dynamicTranslationKey(`QUEUE.STATUS.${status.toUpperCase()}`))}
              />
            );
          })
        )}
      </div>
      <div className={s.legend}>
        {nonZeroStatuses.map((status) => (
          <Link
            to={links.queuePage(queue.name, { [queue.name]: status })}
            key={status}
            className={s.legendItem}
            title={t(dynamicTranslationKey(`QUEUE.STATUS.${status.toUpperCase()}`))}
          >
            <span className={cn(s.dot, s[toCamelCase(status)])} />
            <span className={s.count}>{queue.counts[status]}</span>
          </Link>
        ))}
        <span className={s.total}>{t('DASHBOARD.JOBS_COUNT', { count: total })}</span>
      </div>
    </div>
  );
};
