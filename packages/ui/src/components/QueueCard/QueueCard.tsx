import type { AppQueue } from '@bull-board/api/typings/app';
import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { Button } from '../Button/Button';
import { PauseIcon } from '../Icons/Pause';
import { PlayIcon } from '../Icons/Play';
import { useQueues } from '../../hooks/useQueues';
import { links } from '../../utils/links';
import { Card } from '../Card/Card';
import { QueueStats } from './QueueStats/QueueStats';
import s from './QueueCard.module.css';

interface IQueueCardProps {
  queue: AppQueue;
}

export const QueueCard = ({ queue }: IQueueCardProps) => {
  const { t } = useTranslation();
  const { actions } = useQueues();
  const buttonRef = useRef<HTMLButtonElement>(null);

  const pauseResumeLabel = `${queue.isPaused ? t('QUEUE.ACTIONS.RESUME') : t('QUEUE.ACTIONS.PAUSE')} ${queue.name}`;

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
    <div>
      <Button ref={buttonRef} className={s.stateBtn} onClick={() => { (queue.isPaused ? actions.resumeQueue(queue.name) : actions.pauseQueue(queue.name))().then(() => buttonRef.current?.focus()); }} type='button' aria-label={pauseResumeLabel} title={pauseResumeLabel}>
        {queue.isPaused ? (
          <>
            <PlayIcon />
            {t('QUEUE.ACTIONS.RESUME')}
          </>
        ) : (
          <>
            <PauseIcon />
            {t('QUEUE.ACTIONS.PAUSE')}
          </>
        )}
      </Button>
    </div>
  </Card>
);
};
