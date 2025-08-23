import { AppQueue, Status } from '@bull-board/api/typings/app';
import cn from 'clsx';
import React, { PropsWithChildren, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHistory } from 'react-router-dom';
import { links } from '../../utils/links';
import { ChevronDown } from '../Icons/ChevronDown';
import s from './MobileStatusMenu.module.css';

export const MobileStatusMenu = ({ queue, children }: PropsWithChildren<{ queue: AppQueue }>) => {
  const { t } = useTranslation();
  const history = useHistory();
  const [isOpen, setIsOpen] = useState(false);

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
    setIsOpen(false);
  };

  return (
    <div className={s.container}>
      {/* Mobile Status Dropdown - 90% width */}
      <div className={s.statusDropdown}>
        <button
          className={s.trigger}
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-haspopup="true"
        >
          <span className={s.currentStatus}>
            {currentStatusDisplay}
            {currentCount > 0 && <span className={s.currentBadge}>{currentCount}</span>}
          </span>
          <ChevronDown className={cn(s.chevron, { [s.open]: isOpen })} />
        </button>

        {isOpen && (
          <>
            <div className={s.backdrop} onClick={() => setIsOpen(false)} />
            <div className={s.dropdown}>
              {queue.statuses.map((status) => {
                const isLatest = status === 'latest';
                const displayStatus = t(`QUEUE.STATUS.${status.toUpperCase()}`).toLocaleUpperCase();
                const count = (queue.counts as any)[status] || 0;
                const isActive = currentStatus === status || (isLatest && currentStatus === 'latest');

                return (
                  <button
                    key={`${queue.name}-${status}`}
                    className={cn(s.item, { [s.active]: isActive })}
                    onClick={() => handleStatusSelect(status)}
                  >
                    <span className={s.statusName}>{displayStatus}</span>
                    {count > 0 && <span className={s.badge}>{count}</span>}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Actions Container - 10% width */}
      <div className={s.actionsContainer}>
        {children}
      </div>
    </div>
  );
};
