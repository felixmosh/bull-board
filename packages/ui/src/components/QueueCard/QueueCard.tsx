import type { AppQueue } from '@bull-board/api/typings/app';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { links } from '../../utils/links';
import { Card } from '../Card/Card';
import { QueueStats } from './QueueStats/QueueStats';
import s from './QueueCard.module.css';

interface IQueueCardProps {
  queue: AppQueue;
}

export const QueueCard = ({ queue }: IQueueCardProps) => {
  const { t } = useTranslation();

  return (
    <Card className={s.queueCard}>
      <div className={s.header}>
        <NavLink to={links.queuePage(queue.name)} className={s.link}>
          {queue.displayName}
        </NavLink>
        {queue.isPaused && (
          <span className={s.pausedBadge}>[ {t('MENU.PAUSED')} ]</span>
        )}
      </div>
      <QueueStats queue={queue} />
    </Card>
  );
};
