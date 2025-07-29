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
}

export const QueueGroupCard = ({ group, actions }: IQueueGroupCardProps) =>
  group.queue ? (
    <li key={group.queue.name}>
      <QueueCard queue={group.queue} />
    </li>
  ) : group.children.length === 1 ? (
    <QueueGroupCard group={group.children[0]} actions={actions} />
  ) : (
    <li key={`${group.prefix}.${name}`}>
      <ul className={s.queueGroup}>
        <Card className={s.queueGroupCard}>
          <div className={s.groupHeader}>
            <p className={s.groupPrefix}>{group.prefix}</p>
            <QueueGroupActions group={group} actions={actions} />
          </div>
          {group.children.map((childGroup) => (
            <QueueGroupCard
              key={`${childGroup.prefix}.${childGroup.name}`}
              group={childGroup}
              actions={actions}
            />
          ))}
        </Card>
      </ul>
    </li>
  );
