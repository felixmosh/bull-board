import { STATUSES } from '@bull-board/api/src/constants/statuses';
import { Status } from '@bull-board/api/typings/app';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../Button/Button';
import { PromoteIcon } from '../../Icons/Promote';
import { RetryIcon } from '../../Icons/Retry';
import { TrashIcon } from '../../Icons/Trash';
import { Tooltip } from '../../Tooltip/Tooltip';
import s from './JobActions.module.css';

interface JobActionsProps {
  status: Status;
  allowRetries: boolean;
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
  [STATUSES.completed]: [buttonTypes.retry, buttonTypes.clean],
  [STATUSES.waiting]: [buttonTypes.clean],
};

export const JobActions = ({ actions, status, allowRetries }: JobActionsProps) => {
  let buttons = statusToButtonsMap[status];
  const { t } = useTranslation();
  if (!buttons) {
    return null;
  }

  if (!allowRetries) {
    buttons = buttons.filter((btn) => btn.actionKey !== 'retryJob');
  }

  return (
    <ul className={s.jobActions}>
      {buttons.map((type) => (
        <li key={type.title}>
          <Tooltip title={t(`JOB.ACTIONS.${type.title.toUpperCase()}`)}>
            <Button onClick={actions[type.actionKey]} className={s.button}>
              <type.Icon />
            </Button>
          </Tooltip>
        </li>
      ))}
    </ul>
  );
};
