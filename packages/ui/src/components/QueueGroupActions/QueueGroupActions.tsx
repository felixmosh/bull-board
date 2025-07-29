import React from 'react';
import { QueueActions } from '../../../typings/app';
import { Button } from '../Button/Button';
import { PromoteIcon } from '../Icons/Promote';
import { RetryIcon } from '../Icons/Retry';
import { TrashIcon } from '../Icons/Trash';
import s from './QueueGroupActions.module.css';
import { AppQueueTreeNode } from '../../utils/toTree';

interface QueueActionProps {
  group: AppQueueTreeNode;
  actions: QueueActions;
}

function queueGroupNames(group: AppQueueTreeNode): string[] {
  const names = group.children.flatMap(queueGroupNames);
  if (group.queue != null) names.push(group.queue.name);

  return names;
}

export const QueueGroupActions = ({ actions, group }: QueueActionProps) => {
  return (
    <ul className={s.queueActions}>
      <li>
        <Button
          onClick={actions.retryAllMultiple(queueGroupNames(group), 'failed')}
          className={s.button}
        >
          <RetryIcon />
        </Button>
      </li>
      <li>
        <Button onClick={actions.promoteAllMultiple(queueGroupNames(group))} className={s.button}>
          <PromoteIcon />
        </Button>
      </li>
      <li>
        <Button
          onClick={actions.cleanAllMultiple(queueGroupNames(group), 'failed')}
          className={s.button}
        >
          <TrashIcon />
        </Button>
      </li>
    </ul>
  );
};
