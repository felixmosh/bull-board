import React from 'react';
import { Status, STATUSES } from '../../constants';
import { PromoteIcon } from '../../Icons/Promote';
import { RetryIcon } from '../../Icons/Retry';
import { TrashIcon } from '../../Icons/Trash';
import { Tooltip } from '../../Tooltip/Tooltip';
import { Button } from '../Button/Button';
import s from './JobActions.module.css';

interface JobActionsProps {
  status: Status;
  actions: {
    promoteJob: () => Promise<void>;
    retryJob: () => Promise<void>;
    cleanJob: () => Promise<void>;
  };
}

interface ButtonType {
  title: string;
  Icon: React.ElementType;
  actionKey: 'promoteJob' | 'cleanJob' | 'retryJob';
}

const buttonTypes: Record<string, ButtonType> = {
  promote: { title: 'Promote', Icon: PromoteIcon, actionKey: 'promoteJob' },
  clean: { title: 'Clean', Icon: TrashIcon, actionKey: 'cleanJob' },
  retry: { title: 'Retry', Icon: RetryIcon, actionKey: 'retryJob' },
};

const statusToButtonsMap: Record<string, ButtonType[]> = {
  [STATUSES.failed]: [buttonTypes.retry, buttonTypes.clean],
  [STATUSES.delayed]: [buttonTypes.promote, buttonTypes.clean],
  [STATUSES.completed]: [buttonTypes.clean],
  [STATUSES.waiting]: [buttonTypes.clean],
};

export const JobActions = ({ actions, status }: JobActionsProps) => {
  const buttons = statusToButtonsMap[status];
  if (!buttons) {
    return null;
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
