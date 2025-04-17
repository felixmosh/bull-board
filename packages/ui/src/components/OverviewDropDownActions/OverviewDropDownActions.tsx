import type { AppQueue } from '@bull-board/api/typings/app';
import {
  Content,
  Item,
  Portal,
  Root,
  Separator,
  Sub,
  SubContent,
  SubTrigger,
  Trigger,
} from '@radix-ui/react-dropdown-menu';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { QueueActions } from '../../../typings/app';
import type { QueueSortKey, SortDirection } from '../../hooks/useSortQueues';
import { Button } from '../Button/Button';
import { EllipsisVerticalIcon } from '../Icons/EllipsisVertical';
import { PauseIcon } from '../Icons/Pause';
import { PlayIcon } from '../Icons/Play';
import { SortIcon } from '../Icons/Sort';
import { SortDirectionDown } from '../Icons/SortDirectionDown';
import { SortDirectionUp } from '../Icons/SortDirectionUp';
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

  const areAllPaused = queues.every((queue) => queue.isPaused);
  const areAllReadOnly = queues.every((queue) => queue.readOnlyMode);
  const SortDirection = sortDirection === 'asc' ? <SortDirectionDown /> : <SortDirectionUp />;

  return (
    <Root>
      <Trigger asChild>
        <Button>
          <EllipsisVerticalIcon />
        </Button>
      </Trigger>

      <Portal>
        <Content className={s.content} align="end">
          {areAllReadOnly ? null : (
            <>
              {areAllPaused ? (
                <Item onClick={actions.resumeAll}>
                  <PlayIcon />
                  {t('QUEUE.ACTIONS.RESUME_ALL')}
                </Item>
              ) : (
                <Item onClick={actions.pauseAll}>
                  <PauseIcon />
                  {t('QUEUE.ACTIONS.PAUSE_ALL')}
                </Item>
              )}
              <Separator />
            </>
          )}
          <Sub>
            <SubTrigger className={s.subTrigger}>
              <SortIcon />
              {t('DASHBOARD.SORTING.TITLE')}
            </SubTrigger>
            <SubContent className={s.subContent} sideOffset={2}>
              {sortOptions.map((key) => (
                <Item key={key} onClick={() => onSort(key as QueueSortKey)}>
                  {sortBy === key && SortDirection}
                  {t(`DASHBOARD.SORTING.${key.toUpperCase()}`)}
                </Item>
              ))}
            </SubContent>
          </Sub>
        </Content>
      </Portal>
    </Root>
  );
};

export default OverviewActions;
