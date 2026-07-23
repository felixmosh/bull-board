import { Menu } from '@base-ui/react/menu';
import { STATUSES } from '@bull-board/api/constants/statuses';
import type { AppQueue } from '@bull-board/api/typings/app';
import { useTranslation } from 'react-i18next';
import { QueueActions } from '../../../typings/app';
import { canRetryFailedJobs } from '../../utils/failedRetries';
import { Button } from '../Button/Button';
import { DropdownContent } from '../DropdownContent/DropdownContent';
import { AddIcon } from '../Icons/Add';
import { ConcurrencyIcon } from '../Icons/Concurrency';
import { EllipsisVerticalIcon } from '../Icons/EllipsisVertical';
import { ObliterateIcon } from '../Icons/Obliterate';
import { PauseIcon } from '../Icons/Pause';
import { PlayIcon } from '../Icons/Play';
import { RetryIcon } from '../Icons/Retry';
import { TrashIcon } from '../Icons/Trash';
import s from './QueueDropdownActions.module.css';

export const QueueDropdownActions = ({
  queue,
  actions,
}: {
  queue: AppQueue;
  actions: Omit<QueueActions, 'addJob'> & { addJob: () => void; onConcurrency?: () => void };
}) => {
  const { t } = useTranslation();

  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <Button className={s.trigger}>
            <EllipsisVerticalIcon />
          </Button>
        }
      />

      <Menu.Portal>
        <Menu.Positioner align="end" style={{ zIndex: 100 }}>
          <DropdownContent>
            <Menu.Item onClick={actions.addJob}>
              <AddIcon />
              {t('QUEUE.ACTIONS.ADD_JOB')}
            </Menu.Item>
            {canRetryFailedJobs(queue) && (
              <Menu.Item onClick={actions.retryAll(queue.name, STATUSES.failed)}>
                <RetryIcon />
                {t('QUEUE.ACTIONS.RETRY_ALL_FAILED', { count: queue.counts.failed })}
              </Menu.Item>
            )}
            <Menu.Item
              onClick={
                queue.isPaused ? actions.resumeQueue(queue.name) : actions.pauseQueue(queue.name)
              }
            >
              {queue.isPaused ? (
                <>
                  <PlayIcon />
                  {t('QUEUE.ACTIONS.RESUME')}
                </>
              ) : (
                <>
                  <PauseIcon />
                  {t('QUEUE.ACTIONS.PAUSE')}
                </>
              )}
            </Menu.Item>
            {queue.type === 'bullmq' && !!actions.onConcurrency && (
              <Menu.Item onClick={actions.onConcurrency}>
                <ConcurrencyIcon />
                {t('QUEUE.ACTIONS.SET_CONCURRENCY')}
              </Menu.Item>
            )}
            <Menu.Item onClick={actions.emptyQueue(queue.name)}>
              <TrashIcon />
              {t('QUEUE.ACTIONS.EMPTY')}
            </Menu.Item>
            <Menu.Item onClick={actions.obliterateQueue(queue.name)} className={s.danger}>
              <ObliterateIcon />
              {t('QUEUE.ACTIONS.OBLITERATE')}
            </Menu.Item>
          </DropdownContent>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
};
