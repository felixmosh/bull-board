import React, { PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, NavLinkProps } from 'react-router-dom';
import { toCamelCase } from '../../utils/toCamelCase';
import s from './StatusTabs.module.css';

export interface StatusTabItem {
  status: string;
  to: NavLinkProps['to'];
  isActive: NavLinkProps['isActive'];
  count?: number;
}

interface StatusTabsProps {
  items: StatusTabItem[];
}

export const StatusTabs = ({ items, children }: PropsWithChildren<StatusTabsProps>) => {
  const { t } = useTranslation();

  return (
    <div className={s.statusBar}>
      <div className={s.tabsWrapper}>
        <ul className={s.statusTabs}>
          {items.map(({ status, to, isActive, count }) => {
            const displayStatus = t(`QUEUE.STATUS.${status.toUpperCase()}`).toLocaleUpperCase();

            return (
              <li key={status} className={s[toCamelCase(status)]}>
                <NavLink
                  to={to}
                  activeClassName={s.isActive}
                  isActive={isActive}
                >
                  {status !== 'latest' && <span className={s.dot} />}
                  <span data-text={displayStatus}>{displayStatus}</span>
                  {count != null && count > 0 && <span className={s.badge}>{count}</span>}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </div>
      {!!children && <div className={s.trailing}>{children}</div>}
    </div>
  );
};
