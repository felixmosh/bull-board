import { AppQueue } from '@wirdo-bullboard/api/typings/app';
import React from 'react';
import { NavLink } from 'react-router-dom';
import { links } from '../../utils/links';
import { Card } from '../Card/Card';
import { QueueStats } from './QueueStats/QueueStats';
import s from './QueueCard.module.css';

interface IQueueCardProps {
  queue: AppQueue;
}

export const QueueCard = ({ queue }: IQueueCardProps) => (
  <Card className={s.queueCard}>
    <div>
      <NavLink to={links.queuePage(queue.name)} className={s.link}>
        {queue.name}
      </NavLink>
    </div>
    <QueueStats queue={queue} />
  </Card>
);
