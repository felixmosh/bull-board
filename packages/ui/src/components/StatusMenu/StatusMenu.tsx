import { AppQueue } from '@bull-board/api/typings/app';
import React, { PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { links } from '../../utils/links';
import { MobileStatusMenu } from './MobileStatusMenu';
import s from './StatusMenu.module.css';

export const StatusMenu = ({ queue, children }: PropsWithChildren<{ queue: AppQueue }>) => {
  const { t } = useTranslation();

  return (
    <>
      {/* Desktop Status Menu */}
      <div className={s.statusMenu}>
        {queue.statuses.map((status) => {
          const isLatest = status === 'latest';
          const displayStatus = t(`QUEUE.STATUS.${status.toUpperCase()}`).toLocaleUpperCase();
          return (
            <NavLink
              to={links.queuePage(queue.name, { [queue.name]: status })}
              activeClassName={s.active}
              isActive={(_path, { search }) => {
                const query = new URLSearchParams(search);
                return query.get('status') === status || (isLatest && query.get('status') === null);
              }}
              key={`${queue.name}-${status}`}
            >
              <span title={displayStatus}>{displayStatus}</span>
              {queue.counts[status] > 0 && <span className={s.badge}>{queue.counts[status]}</span>}
            </NavLink>
          );
        })}
        {!!children && <div>{children}</div>}
      </div>

      {/* Mobile Status Menu */}
      <MobileStatusMenu queue={queue}>
        {children}
      </MobileStatusMenu>
    </>
  );
};
