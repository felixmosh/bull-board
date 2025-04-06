import { AppQueue, QueueSortKey } from '@bull-board/api/dist/typings/app';
import { Item, Portal, Root, Trigger, Separator } from '@radix-ui/react-dropdown-menu';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { QueueActions } from '../../../typings/app';
import { Button } from '../Button/Button';
import { DropdownContent } from '../DropdownContent/DropdownContent';
import { EllipsisVerticalIcon } from '../Icons/EllipsisVertical';
import { PauseIcon } from '../Icons/Pause';
import { PlayIcon } from '../Icons/Play';
import { SortIcon } from '../Icons/Sort';

type OverviewActionsProps = {
  actions: QueueActions;
  queues: AppQueue[] | null;
  onSort: (sortKey: QueueSortKey) => void;
  selectedSort: QueueSortKey;
};

export const OverviewActions = ({
  actions,
  queues,
  onSort,
  selectedSort,
}: OverviewActionsProps) => {
  const { t } = useTranslation();

  if (!queues) {
    return null;
  }

  const areAllPaused = queues.every((queue) => queue.isPaused);
  const sortOptions = [
    { key: 'alphabetical', label: t('DASHBOARD.SORTING.ALPHABETICAL') },
    { key: 'failed', label: t('DASHBOARD.SORTING.FAILED') },
    { key: 'completed', label: t('DASHBOARD.SORTING.COMPLETED') },
    { key: 'active', label: t('DASHBOARD.SORTING.ACTIVE') },
    { key: 'waiting', label: t('DASHBOARD.SORTING.WAITING') },
    { key: 'delayed', label: t('DASHBOARD.SORTING.DELAYED') },
  ];

  return (
    <Root>
      <Trigger asChild>
        <Button>
          <EllipsisVerticalIcon />
        </Button>
      </Trigger>

      <Portal>
        <DropdownContent align="end">
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
          {sortOptions.map((option) => (
            <Item 
              key={option.key} 
              onClick={() => onSort(option.key as QueueSortKey)}
            >
              <SortIcon />
              {option.label}
              {selectedSort === option.key && ' ✓'}
            </Item>
          ))}
        </DropdownContent>
      </Portal>
    </Root>
  );
};

export default OverviewActions;
