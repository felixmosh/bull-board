import React from 'react';
import { Store } from '../../hooks/useStore';
import { RetryIcon } from '../Icons/Retry';
import { TrashIcon } from '../Icons/Trash';
import { Button } from '../JobCard/Button/Button';
import s from './QueueActions.module.css';
import { AppQueue, Status } from '@bull-board/api/typings/app';
import { STATUSES } from '@bull-board/api/src/constants/statuses';

interface QueueActionProps {
  queue: AppQueue;
  actions: Store['actions'];
  status: Status;
  allowRetries: boolean;
}

const ACTIONABLE_STATUSES = [STATUSES.failed, STATUSES.delayed, STATUSES.completed] as const;

const isStatusActionable = (status: Status): boolean => ACTIONABLE_STATUSES.includes(status as any);

const CleanAllButton = ({ onClick }: any) => (
  <Button onClick={onClick} className={s.button}>
    <TrashIcon />
    Clean all
  </Button>
);

export const QueueActions = ({ status, actions, queue, allowRetries }: QueueActionProps) => {
  if (!isStatusActionable(status)) {
    return null;
  }

  return (
    <ul className={s.queueActions}>
      {status === STATUSES.failed && (
        <>
          {allowRetries && (
            <li>
              <Button onClick={actions.retryAll(queue.name)} className={s.button}>
                <RetryIcon />
                Retry all
              </Button>
            </li>
          )}
          <li>
            <CleanAllButton onClick={actions.cleanAllFailed(queue.name)} />
          </li>
        </>
      )}
      {status === STATUSES.delayed && (
        <li>
          <CleanAllButton onClick={actions.cleanAllDelayed(queue.name)} />
        </li>
      )}
      {status === STATUSES.completed && (
        <li>
          <CleanAllButton onClick={actions.cleanAllCompleted(queue.name)} />
        </li>
      )}
    </ul>
  );
};
