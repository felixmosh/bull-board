import { AppQueue } from '@bull-board/api/typings/app';
import { Content, Item, Root, Trigger, Portal } from '@radix-ui/react-dropdown-menu';
import React from 'react';
import { Store } from '../../hooks/useStore';
import { EllipsisVerticalIcon } from '../Icons/EllipsisVertical';
import { PauseIcon } from '../Icons/Pause';
import { PlayIcon } from '../Icons/Play';
import { TrashIcon } from '../Icons/Trash'
import { Button } from '../JobCard/Button/Button';
import s from './QueueDropdownActions.module.css';
import classNames from 'classnames/bind';
import { useSettingsStore } from '../../hooks/useSettings';

const cx = classNames.bind(s);

export const QueueDropdownActions = ({
  queue,
  actions,
}: {
  queue: AppQueue;
  actions: Store['actions'];
}) => {
  const { darkMode } = useSettingsStore() 
  return (
  <Root>
    <Trigger asChild>
      <Button className={s.trigger}>
        <EllipsisVerticalIcon />
      </Button>
    </Trigger>

    <Portal>
      <Content className={cx('content', { dark: darkMode })} align="end">
        <Item
          className={s.item}
          onSelect={
            queue.isPaused ? actions.resumeQueue(queue.name) : actions.pauseQueue(queue.name)
          }
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
        <Item
          className={s.item}
          onSelect={
            actions.emptyQueue(queue.name)
          }
        >          
          <TrashIcon />
          Empty
        </Item>
      </Content>
    </Portal>
  </Root>
)};
