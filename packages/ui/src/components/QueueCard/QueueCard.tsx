import { AppQueue } from '@bull-board/api/dist/typings/app';
import React from 'react';
import { Card } from '../Card/Card';
import { QueueStats } from './QueueStats/QueueStats';
import s from './QueueCard.module.css';

interface IQueueCardProps {
  queue: AppQueue;
}

export const QueueCard = ({ queue }: IQueueCardProps) => (
  <Card className={s.queueCard}>
    <div>{queue.name}</div>
    <QueueStats queue={queue} />
  </Card>
);
