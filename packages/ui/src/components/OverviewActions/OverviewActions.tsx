import React from 'react';
import { Item, Portal, Root, Trigger } from '@radix-ui/react-dropdown-menu';
import { Button } from '../Button/Button';
import { DropdownContent } from '../DropdownContent/DropdownContent';
import { EllipsisVerticalIcon } from '../Icons/EllipsisVertical';
import { PauseIcon } from '../Icons/Pause';
import { PlayIcon } from '../Icons/Play';
import { useTranslation } from 'react-i18next';

export const OverviewActions = () => {
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
          <Item>
            <PauseIcon />
            {t('QUEUE.ACTIONS.PAUSE_ALL')}
          </Item>
          <Item>
            <PlayIcon />
            {t('QUEUE.ACTIONS.RESUME_ALL')}
          </Item>
        </DropdownContent>
      </Portal>
    </Root>
  );
};

export default OverviewActions;
