import React from 'react';
import { Item, Portal, Root, Trigger } from '@radix-ui/react-dropdown-menu';
import { Button } from '../Button/Button';
import { DropdownContent } from '../DropdownContent/DropdownContent';
import { EllipsisVerticalIcon } from '../Icons/EllipsisVertical';
import { PauseIcon } from '../Icons/Pause';
import { PlayIcon } from '../Icons/Play';
import { useTranslation } from 'react-i18next';
import { useQueues } from '../../hooks/useQueues';

export const OverviewActions = ({
  actions,
}: {
  actions: ReturnType<typeof useQueues>['actions'];
}) => {
  const { t } = useTranslation();

  return (
    <Root>
      <Trigger asChild>
        <Button>
          <EllipsisVerticalIcon />
        </Button>
      </Trigger>

      <Portal>
        <DropdownContent align="end">
          <Item onClick={actions.pauseAll}>
            <PauseIcon />
            {t('QUEUE.ACTIONS.PAUSE_ALL')}
          </Item>
          <Item onClick={actions.resumeAll}>
            <PlayIcon />
            {t('QUEUE.ACTIONS.RESUME_ALL')}
          </Item>
        </DropdownContent>
      </Portal>
    </Root>
  );
};

export default OverviewActions;
