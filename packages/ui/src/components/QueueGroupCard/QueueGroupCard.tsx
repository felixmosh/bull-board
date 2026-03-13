import React from 'react';
import { Card } from '../Card/Card';
import s from './QueueGroupCard.module.css';
import { AppQueueTreeNode } from '../../utils/toTree';
import { QueueCard } from '../QueueCard/QueueCard';
import { QueueGroupActions } from '../QueueGroupActions/QueueGroupActions';
import { QueueActions } from '../../../typings/app';

interface IQueueGroupCardProps {
  group: AppQueueTreeNode;
  actions: QueueActions;
  hasSiblingGroups?: boolean;
}

export const QueueGroupCard = ({ group, actions, hasSiblingGroups }: IQueueGroupCardProps) => {
  const childHasSiblingGroups = group.children.some((c) => !c.queue);

  return group.queue ? (
    <li key={group.queue.name}>
      <QueueCard queue={group.queue} />
    </li>
  ) : group.children.length === 1 && !hasSiblingGroups ? (
    <>
      {group.children.map((child) => (
        <QueueGroupCard
          key={`${child.prefix}.${child.name}`}
          group={child}
          actions={actions}
          hasSiblingGroups={childHasSiblingGroups}
        />
      ))}
    </>
  ) : (
    <li key={`${group.prefix}.${name}`}>
      <Card className={s.queueGroupCard}>
        <div className={s.groupHeader}>
          <p className={s.groupPrefix}>
            <b>{group.displayName || group.name}</b>
          </p>
          <QueueGroupActions group={group} actions={actions} />
        </div>
        <ul className={s.queueGroup}>
          {group.children.map((childGroup) => (
            <QueueGroupCard
              key={`${childGroup.prefix}.${childGroup.name}`}
              group={childGroup}
              actions={actions}
              hasSiblingGroups={childHasSiblingGroups}
            />
          ))}
        </ul>
      </Card>
    </li>
  );
};
