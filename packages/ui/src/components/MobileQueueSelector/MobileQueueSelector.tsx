import cn from 'clsx';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHistory } from 'react-router-dom';
import { useActiveQueueName } from '../../hooks/useActiveQueueName';
import { useQueues } from '../../hooks/useQueues';
import { links } from '../../utils/links';
import { ChevronDown } from '../Icons/ChevronDown';
import s from './MobileQueueSelector.module.css';

export const MobileQueueSelector = () => {
  const { t } = useTranslation();
  const { queues } = useQueues();
  const activeQueueName = useActiveQueueName();
  const history = useHistory();
  const [isOpen, setIsOpen] = useState(false);

  const currentQueue = queues?.find(queue => queue.name === activeQueueName);
  const displayName = currentQueue?.name || t('MENU.OVERVIEW');

  const handleQueueSelect = (queueName: string) => {
    const { pathname, search } = links.queuePage(queueName);
    history.push({ pathname, search });
    setIsOpen(false);
  };

  const handleOverviewSelect = () => {
    history.push('/');
    setIsOpen(false);
  };

  return (
    <div className={s.container}>
      <button
        className={s.trigger}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <span className={s.currentQueue}>{displayName}</span>
        <ChevronDown className={cn(s.chevron, { [s.open]: isOpen })} />
      </button>

      {isOpen && (
        <>
          <div className={s.backdrop} onClick={() => setIsOpen(false)} />
          <div className={s.dropdown}>
            <div className={s.section}>
              <button
                className={cn(s.item, { [s.active]: !activeQueueName })}
                onClick={handleOverviewSelect}
              >
                {t('MENU.OVERVIEW')}
              </button>
            </div>

            {queues && queues.length > 0 && (
              <div className={s.section}>
                <div className={s.sectionTitle}>{t('MENU.QUEUES')}</div>
                {queues.map((queue) => (
                  <button
                    key={queue.name}
                    className={cn(s.item, { [s.active]: queue.name === activeQueueName })}
                    onClick={() => handleQueueSelect(queue.name)}
                  >
                    <span className={s.queueName}>{queue.name}</span>
                    {queue.counts && (
                      <span className={s.queueStats}>
                        {Object.values(queue.counts).reduce((acc: number, val: any) => acc + (val || 0), 0)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
