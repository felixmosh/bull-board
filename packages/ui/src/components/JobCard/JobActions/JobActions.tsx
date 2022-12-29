import React from 'react';
import { PromoteIcon } from '../../Icons/Promote';
import { RetryIcon } from '../../Icons/Retry';
import { TrashIcon } from '../../Icons/Trash';
import { Tooltip } from '../../Tooltip/Tooltip';
import { Button } from '../Button/Button';
import s from './JobActions.module.css';
import { Status } from '@bull-board/api/typings/app';
import { STATUSES } from '@bull-board/api/src/constants/statuses';

interface JobActionsProps {
  status: Status;
  allowRetries: boolean;
  actions: {
    promoteJob: () => Promise<void>;
    retryFailedJob: () => Promise<void>;
    retryCompletedJob: () => Promise<void>;
    cleanJob: () => Promise<void>;
  };
}

interface ButtonType {
  title: string;
  Icon: React.ElementType;
  actionKey: 'promoteJob' | 'cleanJob' | 'retryFailedJob' | 'retryCompletedJob';
}

const buttonTypes: Record<string, ButtonType> = {
  promote: { title: 'Promote', Icon: PromoteIcon, actionKey: 'promoteJob' },
  clean: { title: 'Clean', Icon: TrashIcon, actionKey: 'cleanJob' },
  retryFailed: { title: 'Retry', Icon: RetryIcon, actionKey: 'retryFailedJob' },
  retryCompleted: { title: 'Retry', Icon: RetryIcon, actionKey: 'retryCompletedJob' },
};

const statusToButtonsMap: Record<string, ButtonType[]> = {
  [STATUSES.failed]: [buttonTypes.retryFailed, buttonTypes.clean],
  [STATUSES.delayed]: [buttonTypes.promote, buttonTypes.clean],
  [STATUSES.completed]: [buttonTypes.retryCompleted, buttonTypes.clean],
  [STATUSES.waiting]: [buttonTypes.clean],
};

function isRetry(actionKey: ButtonType['actionKey']) {
  return ['retryFailedJob', 'retryCompletedJob'].includes(actionKey);
}

export const JobActions = ({ actions, status, allowRetries }: JobActionsProps) => {
  let buttons = statusToButtonsMap[status];
  if (!buttons) {
    return null;
  }
  if (!allowRetries) {
    buttons = buttons.filter((btn) => !isRetry(btn.actionKey));
  }
  return (
    <ul className={s.jobActions}>
      {buttons.map((type) => (
        <li key={type.title}>
          <Tooltip title={type.title}>
            <Button onClick={actions[type.actionKey]} className={s.button}>
              <type.Icon />
            </Button>
          </Tooltip>
        </li>
      ))}
    </ul>
  );
};
