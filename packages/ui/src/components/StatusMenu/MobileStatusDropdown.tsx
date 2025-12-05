import { AppQueue, Status } from '@bull-board/api/typings/app';
import cn from 'clsx';
import React, { PropsWithChildren } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useTranslation } from 'react-i18next';
import { useHistory } from 'react-router-dom';
import { links } from '../../utils/links';
import { DropdownContent } from '../DropdownContent/DropdownContent';
import { ChevronDown } from '../Icons/ChevronDown';
import s from './MobileStatusDropdown.module.css';

export const MobileStatusDropdown = ({ queue, children }: PropsWithChildren<{ queue: AppQueue }>) => {
  const { t } = useTranslation();
  const history = useHistory();

  // Get current status from URL
  const getCurrentStatus = (): Status => {
    const search = new URLSearchParams(history.location.search);
    return (search.get('status') as Status) || 'latest';
  };

  const currentStatus = getCurrentStatus();
  const currentStatusDisplay = t(`QUEUE.STATUS.${currentStatus.toUpperCase()}`).toLocaleUpperCase();
  const currentCount = (queue.counts as any)[currentStatus] || 0;

  const handleStatusSelect = (status: Status) => {
    const isLatest = status === 'latest';
    const { pathname, search } = links.queuePage(queue.name, isLatest ? {} : { [queue.name]: status });
    history.push({ pathname, search });
  };

  return (
    <div className={s.container}>
      <div className={s.statusDropdown}>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger className={s.trigger} asChild>
            <button>
              <span className={s.currentStatus}>
                {currentStatusDisplay}
                {currentCount > 0 && <span className={s.currentBadge}>{currentCount}</span>}
              </span>
              <ChevronDown className={s.chevron} />
            </button>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownContent sideOffset={5}>
              {queue.statuses.map((status) => {
                const isLatest = status === 'latest';
                const displayStatus = t(`QUEUE.STATUS.${status.toUpperCase()}`).toLocaleUpperCase();
                const count = (queue.counts as any)[status] || 0;
                const isActive = currentStatus === status || (isLatest && currentStatus === 'latest');

                return (
                  <DropdownMenu.Item
                    key={`${queue.name}-${status}`}
                    className={cn(s.item, { [s.active]: isActive })}
                    onSelect={() => handleStatusSelect(status)}
                  >
                    <span className={s.statusName}>{displayStatus}</span>
                    {count > 0 && <span className={s.badge}>{count}</span>}
                  </DropdownMenu.Item>
                );
              })}
            </DropdownContent>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      <div className={s.actionsContainer}>
        {children}
      </div>
    </div>
  );
};
