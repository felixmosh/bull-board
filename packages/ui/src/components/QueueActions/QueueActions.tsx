import { STATUSES } from '@bull-board/api/constants/statuses';
import type { AppQueue, JobCleanStatus, JobRetryStatus, Status } from '@bull-board/api/typings/app';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { QueueActions as QueueActionsType } from '../../../typings/app';
import { Button } from '../Button/Button';
import { PromoteIcon } from '../Icons/Promote';
import { RetryIcon } from '../Icons/Retry';
import { TrashIcon } from '../Icons/Trash';
import s from './QueueActions.module.css';

interface QueueActionProps {
  queue: AppQueue;
  actions: QueueActionsType;
  status: Status;
  allowRetries: boolean;
}

const ACTIONABLE_STATUSES = [STATUSES.failed, STATUSES.delayed, STATUSES.completed] as const;

const isStatusActionable = (status: any): boolean => ACTIONABLE_STATUSES.includes(status);

function isCleanAllStatus(status: any): status is JobCleanStatus {
  return [STATUSES.failed, STATUSES.delayed, STATUSES.completed].includes(status);
}

function isRetryAllStatus(status: any): status is JobRetryStatus {
  return [STATUSES.failed, STATUSES.completed].includes(status);
}

function isPromoteAllStatus(status: any): status is JobRetryStatus {
  return [STATUSES.delayed].includes(status);
}

export const QueueActions = ({ status, actions, queue, allowRetries }: QueueActionProps) => {
  const { t } = useTranslation();
  if (!isStatusActionable(status)) {
    return null;
  }

  return (
    <ul className={s.queueActions}>
      {isRetryAllStatus(status) && allowRetries && (
        <li>
          <Button onClick={actions.retryAll(queue.name, status)} className={s.button}>
            <RetryIcon />
            {t('QUEUE.ACTIONS.RETRY_ALL')}
          </Button>
        </li>
      )}
      {isPromoteAllStatus(status) && (
        <li>
          <Button onClick={actions.promoteAll(queue.name)} className={s.button}>
            <PromoteIcon />
            {t('QUEUE.ACTIONS.PROMOTE_ALL')}
          </Button>
        </li>
      )}
      {isCleanAllStatus(status) && (
        <li>
          <Button onClick={actions.cleanAll(queue.name, status)} className={s.button}>
            <TrashIcon />
            {t('QUEUE.ACTIONS.CLEAN_ALL')}
          </Button>
        </li>
      )}
    </ul>
  );
};
