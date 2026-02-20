import type { AppQueue } from '@bull-board/api/typings/app';
import { Item, Portal, Root, Trigger } from '@radix-ui/react-dropdown-menu';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { QueueActions } from '../../../typings/app';
import { Button } from '../Button/Button';
import { DropdownContent } from '../DropdownContent/DropdownContent';
import { AddIcon } from '../Icons/Add';
import { EllipsisVerticalIcon } from '../Icons/EllipsisVertical';
import { ObliterateIcon } from '../Icons/Obliterate';
import { PauseIcon } from '../Icons/Pause';
import { PlayIcon } from '../Icons/Play';
import { ConcurrencyIcon } from '../Icons/Concurrency';
import { TrashIcon } from '../Icons/Trash';
import s from './QueueDropdownActions.module.css';

export const QueueDropdownActions = ({
  queue,
  actions,
}: {
  queue: AppQueue;
  actions: Omit<QueueActions, 'addJob'> & { addJob: () => void; onConcurrency?: () => void };
}) => {
  const { t } = useTranslation();

  return (
    <Root>
      <Trigger asChild>
        <Button className={s.trigger}>
          <EllipsisVerticalIcon />
        </Button>
      </Trigger>

      <Portal>
        <DropdownContent align="end">
          <Item onSelect={actions.addJob}>
            <AddIcon />
            {t('QUEUE.ACTIONS.ADD_JOB')}
          </Item>
          <Item
            onSelect={
              queue.isPaused ? actions.resumeQueue(queue.name) : actions.pauseQueue(queue.name)
            }
          >
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
          </Item>
          {queue.type === 'bullmq' && !!actions.onConcurrency && (
            <Item onSelect={actions.onConcurrency}>
              <ConcurrencyIcon />
              {t('QUEUE.ACTIONS.SET_CONCURRENCY')}
            </Item>
          )}
          <Item onSelect={actions.emptyQueue(queue.name)}>
            <TrashIcon />
            {t('QUEUE.ACTIONS.EMPTY')}
          </Item>
          <Item onSelect={actions.obliterateQueue(queue.name)} className={s.danger}>
            <ObliterateIcon />
            {t('QUEUE.ACTIONS.OBLITERATE')}
          </Item>
        </DropdownContent>
      </Portal>
    </Root>
  );
};
