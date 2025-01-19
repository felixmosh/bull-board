import { AppQueue } from '@bull-board/api/dist/typings/app';
import { Item, Portal, Root, Trigger } from '@radix-ui/react-dropdown-menu';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { QueueActions } from '../../../typings/app';
import { Button } from '../Button/Button';
import { DropdownContent } from '../DropdownContent/DropdownContent';
import { EllipsisVerticalIcon } from '../Icons/EllipsisVertical';
import { PauseIcon } from '../Icons/Pause';
import { PlayIcon } from '../Icons/Play';

export const OverviewActions = ({
  actions,
  queues,
}: {
  actions: QueueActions;
  queues: AppQueue[] | null;
}) => {
  const { t } = useTranslation();

  if (!queues) {
    return null;
  }

  const areAllPaused = queues.every((queue) => queue.isPaused);

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
        </DropdownContent>
      </Portal>
    </Root>
  );
};

export default OverviewActions;
