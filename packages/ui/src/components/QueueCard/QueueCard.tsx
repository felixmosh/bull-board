import { AppQueue } from '@bull-board/api/dist/typings/app';
import React from 'react';
import { NavLink } from 'react-router-dom';
import { Card } from '../Card/Card';
import { QueueStats } from './QueueStats/QueueStats';
import s from './QueueCard.module.css';

interface IQueueCardProps {
  queue: AppQueue;
}

export const QueueCard = ({ queue }: IQueueCardProps) => (
  <NavLink to={`/queue/${encodeURIComponent(queue.name)}`} className={s.link}>
    <Card className={s.queueCard}>
      <div>
        <span>{queue.name}</span>
      </div>
      <QueueStats queue={queue} />
    </Card>
  </NavLink>
);
