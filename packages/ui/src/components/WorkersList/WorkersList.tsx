import type { QueueWorker } from '@bull-board/api/typings/app';
import cn from 'clsx';
import { useTranslation } from 'react-i18next';
import s from './WorkersList.module.css';

export interface WorkersListProps {
  workers: QueueWorker[];
  /** A paused queue is supposed to have nothing consuming it, so an empty list is not a problem. */
  isPaused: boolean;
}

/** "3 minutes ago" for a connection age in seconds, in the board language. */
const formatAgo = (seconds: number, locale: string) => {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (seconds < 60) return rtf.format(-seconds, 'second');
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return rtf.format(-minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (hours < 24) return rtf.format(-hours, 'hour');
  return rtf.format(-Math.round(hours / 24), 'day');
};

/** The workers connected to one queue, shared by the workers modal and the queue info panel. */
export const WorkersList = ({ workers, isPaused }: WorkersListProps) => {
  const { t, i18n } = useTranslation();

  if (workers.length === 0) {
    return (
      <p className={cn(s.empty, isPaused && s.emptyPaused)}>
        {isPaused ? t('QUEUE.WORKERS.EMPTY_PAUSED') : t('QUEUE.WORKERS.EMPTY')}
        {!isPaused && <span className={s.emptyHint}>{t('QUEUE.WORKERS.EMPTY_HINT')}</span>}
      </p>
    );
  }

  return (
    <ul className={s.workers}>
      {workers.map((worker, index) => {
        const address = worker.name ? worker.addr : null;
        const connected =
          worker.age === null
            ? null
            : t('QUEUE.WORKERS.CONNECTED', { since: formatAgo(worker.age, i18n.language) });

        return (
          <li key={worker.id ?? index} className={s.worker}>
            {/* An unnamed worker has nothing to go by but its address, so that becomes its identity. */}
            <span className={cn(s.identity, !worker.name && !!worker.addr && s.mono)}>
              {worker.name || worker.addr || t('QUEUE.WORKERS.UNNAMED')}
            </span>
            {(address || connected) && (
              <span className={s.meta}>
                {address && <span className={s.mono}>{address}</span>}
                {address && connected && (
                  <span className={s.separator} aria-hidden="true">
                    ·
                  </span>
                )}
                {connected}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
};
