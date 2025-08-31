import React from 'react';
import cn from 'clsx';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useTranslation } from 'react-i18next';
import { useHistory } from 'react-router-dom';
import { useActiveQueueName } from '../../../hooks/useActiveQueueName';
import { useQueues } from '../../../hooks/useQueues';
import { links } from '../../../utils/links';
import { DropdownContent } from '../../DropdownContent/DropdownContent';
import { ChevronDown } from '../../Icons/ChevronDown';
import s from './MobileQueueDropdown.module.css';

export const MobileQueueDropdown = () => {
  const { t } = useTranslation();
  const { queues } = useQueues();
  const activeQueueName = useActiveQueueName();
  const history = useHistory();

  const currentQueue = queues?.find(queue => queue.name === activeQueueName);
  const displayName = currentQueue?.name || t('MENU.OVERVIEW');

  const handleQueueSelect = (queueName: string) => {
    const { pathname, search } = links.queuePage(queueName);
    history.push({ pathname, search });
  };

  const handleOverviewSelect = () => {
    history.push('/');
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className={s.trigger} asChild>
        <button aria-haspopup="true" aria-expanded="false">
          <span className={s.currentQueue}>{displayName}</span>
          <ChevronDown className={s.chevron} />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownContent sideOffset={5}>
          <DropdownMenu.Item
            className={cn(s.item, { [s.active]: !activeQueueName })}
            onSelect={handleOverviewSelect}
          >
            {t('MENU.OVERVIEW')}
          </DropdownMenu.Item>

          {queues && queues.length > 0 && (
            <>
              <DropdownMenu.Separator className={s.separator} />
              {queues.map((queue) => (
                <DropdownMenu.Item
                  key={queue.name}
                  className={cn(s.item, { [s.active]: queue.name === activeQueueName })}
                  onSelect={() => handleQueueSelect(queue.name)}
                >
                  <span className={s.queueName}>{queue.name}</span>
                  {queue.counts && (
                    <span className={s.queueStats}>
                      {Object.values(queue.counts).reduce((acc: number, val: any) => acc + (val || 0), 0)}
                    </span>
                  )}
                </DropdownMenu.Item>
              ))}
            </>
          )}
        </DropdownContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};
