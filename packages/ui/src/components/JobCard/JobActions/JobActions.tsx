import { STATUSES } from '@bull-board/api/src/constants/statuses';
import { Status } from '@bull-board/api/typings/app';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../Button/Button';
import { DuplicateIcon } from '../../Icons/Duplicate';
import { PromoteIcon } from '../../Icons/Promote';
import { RetryIcon } from '../../Icons/Retry';
import { TrashIcon } from '../../Icons/Trash';
import { UpdateIcon } from '../../Icons/UpdateIcon';
import { Tooltip } from '../../Tooltip/Tooltip';
import s from './JobActions.module.css';

interface JobActionsProps {
  status: Status;
  allowRetries: boolean;
  actions: {
    promoteJob: () => Promise<void>;
    retryJob: () => Promise<void>;
    cleanJob: () => Promise<void>;
    updateJobData: () => void;
    duplicateJob: () => void;
  };
}

interface ButtonType {
  titleKey: string;
  Icon: React.ElementType;
  actionKey: 'promoteJob' | 'cleanJob' | 'retryJob' | 'updateJobData' | 'duplicateJob';
}

const buttonTypes: Record<string, ButtonType> = {
  updateData: { titleKey: 'UPDATE_DATA', Icon: UpdateIcon, actionKey: 'updateJobData' },
  promote: { titleKey: 'PROMOTE', Icon: PromoteIcon, actionKey: 'promoteJob' },
  clean: { titleKey: 'CLEAN', Icon: TrashIcon, actionKey: 'cleanJob' },
  retry: { titleKey: 'RETRY', Icon: RetryIcon, actionKey: 'retryJob' },
  duplicate: { titleKey: 'DUPLICATE', Icon: DuplicateIcon, actionKey: 'duplicateJob' },
} as const;

const statusToButtonsMap: Record<string, ButtonType[]> = {
  [STATUSES.failed]: [
    buttonTypes.retry,
    buttonTypes.duplicate,
    buttonTypes.updateData,
    buttonTypes.clean,
  ],
  [STATUSES.delayed]: [
    buttonTypes.promote,
    buttonTypes.duplicate,
    buttonTypes.updateData,
    buttonTypes.clean,
  ],
  [STATUSES.completed]: [buttonTypes.duplicate, buttonTypes.retry, buttonTypes.clean],
  [STATUSES.waiting]: [buttonTypes.duplicate, buttonTypes.updateData, buttonTypes.clean],
} as const;

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
        <li key={type.titleKey}>
          <Tooltip title={t(`JOB.ACTIONS.${type.titleKey}`)}>
            <Button onClick={actions[type.actionKey]} className={s.button}>
              <type.Icon />
            </Button>
          </Tooltip>
        </li>
      ))}
    </ul>
  );
};
