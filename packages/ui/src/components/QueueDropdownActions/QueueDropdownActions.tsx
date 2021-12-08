import { AppQueue } from '@bull-board/api/typings/app';
import { Content, Item, Root, Trigger } from '@radix-ui/react-dropdown-menu';
import React from 'react';
import { Store } from '../../hooks/useStore';
import { EllipsisVerticalIcon } from '../Icons/EllipsisVertical';
import { PauseIcon } from '../Icons/Pause';
import { PlayIcon } from '../Icons/Play';
import { Button } from '../JobCard/Button/Button';
import s from './QueueDropdownActions.module.css';

export const QueueDropdownActions = ({
  queue,
  actions,
}: {
  queue: AppQueue;
  actions: Store['actions'];
}) => (
  <Root>
    <Trigger asChild>
      <Button className={s.trigger}>
        <EllipsisVerticalIcon />
      </Button>
    </Trigger>

    <Content className={s.content} align="end">
      <Item
        className={s.item}
        onSelect={queue.isPaused ? actions.resumeQueue(queue.name) : actions.pauseQueue(queue.name)}
      >
        {queue.isPaused ? (
          <>
            <PlayIcon />
            Resume
          </>
        ) : (
          <>
            <PauseIcon />
            Pause
          </>
        )}
      </Item>
    </Content>
  </Root>
);
