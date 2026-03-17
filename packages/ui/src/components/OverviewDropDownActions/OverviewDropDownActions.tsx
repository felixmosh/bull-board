import type { AppQueue } from '@morpho-org/bull-board-api/typings/app';
import { Content, Item, Portal, Root, Trigger } from '@radix-ui/react-dropdown-menu';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { QueueActions } from '../../../typings/app';
import { QueueSortKey, SortDirection } from '../../utils/toTree';
import { Button } from '../Button/Button';
import { PauseIcon } from '../Icons/Pause';
import { PlayIcon } from '../Icons/Play';
import { PromoteIcon } from '../Icons/Promote';
import { RetryIcon } from '../Icons/Retry';
import { SortIcon } from '../Icons/Sort';
import { SortDirectionDown } from '../Icons/SortDirectionDown';
import { SortDirectionUp } from '../Icons/SortDirectionUp';
import { TrashIcon } from '../Icons/Trash';
import s from './OverviewDropDownActions.module.css';

type OverviewActionsProps = {
  actions: QueueActions;
  queues: AppQueue[] | null;
  onSort: (sortKey: QueueSortKey) => void;
  sortBy: QueueSortKey;
  sortDirection: SortDirection;
};

const sortOptions: QueueSortKey[] = [
  'alphabetical',
  'failed',
  'completed',
  'active',
  'waiting',
  'delayed',
];

export const OverviewActions = ({
  actions,
  queues,
  onSort,
  sortBy,
  sortDirection,
}: OverviewActionsProps) => {
  const { t } = useTranslation();

  if (!queues) {
    return null;
  }

  const actionableQueues = queues.filter((queue) => !queue.readOnlyMode);
  const pausableQueues = actionableQueues.filter((queue) => !queue.isPaused);
  const retriableQueues = actionableQueues.filter((queue) => queue.allowRetries);
  const SortDirectionIcon = sortDirection === 'asc' ? <SortDirectionDown /> : <SortDirectionUp />;

  return (
    <ul className={s.actions}>
      {actionableQueues.length > 0 && (
        <>
          {pausableQueues.length > 0 ? (
            <li>
              <Button
                onClick={actions.pauseMultiple(pausableQueues.map(({ name }) => name))}
                className={s.button}
              >
                <PauseIcon />
              </Button>
            </li>
          ) : (
            <li>
              <Button
                onClick={actions.resumeMultiple(actionableQueues.map(({ name }) => name))}
                className={s.button}
              >
                <PlayIcon />
              </Button>
            </li>
          )}
        </>
      )}
      {retriableQueues.length > 0 && (
        <li>
          <Button
            onClick={actions.retryAllMultiple(
              retriableQueues.map(({ name }) => name),
              'failed'
            )}
            className={s.button}
          >
            <RetryIcon />
          </Button>
        </li>
      )}
      {actionableQueues.length > 0 && (
        <>
          <li>
            <Button
              onClick={actions.promoteAllMultiple(actionableQueues.map(({ name }) => name))}
              className={s.button}
            >
              <PromoteIcon />
            </Button>
          </li>
          <li>
            <Button
              onClick={actions.cleanAllMultiple(
                actionableQueues.map(({ name }) => name),
                'failed'
              )}
              className={s.button}
            >
              <TrashIcon />
            </Button>
          </li>
        </>
      )}
      <li>
        <Root>
          <Trigger asChild>
            <Button className={s.button}>
              <SortIcon />
            </Button>
          </Trigger>
          <Portal>
            <Content className={s.content} align="end">
              {sortOptions.map((key) => (
                <Item key={key} onClick={() => onSort(key as QueueSortKey)}>
                  {sortBy === key && SortDirectionIcon}
                  {t(`DASHBOARD.SORTING.${key.toUpperCase()}`)}
                </Item>
              ))}
            </Content>
          </Portal>
        </Root>
      </li>
    </ul>
  );
};

export default OverviewActions;
