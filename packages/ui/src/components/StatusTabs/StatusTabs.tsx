import { CSSProperties, PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, NavLinkProps } from 'react-router-dom';
import { useOverflowFade } from '../../hooks/useOverflowFade';
import { dynamicTranslationKey } from '../../utils/dynamicTranslationKey';
import { toCamelCase } from '../../utils/toCamelCase';
import s from './StatusTabs.module.css';

export interface StatusTabItem {
  status: string;
  to: NavLinkProps['to'];
  isActive: NavLinkProps['isActive'];
  count?: number;
  dot?: boolean;
}

interface StatusTabsProps {
  items: StatusTabItem[];
}

/** Length of the overflow fade at whichever edge still has tabs beyond it. */
const FADE_WIDTH = '2rem';

export const StatusTabs = ({ items, children }: PropsWithChildren<StatusTabsProps>) => {
  const { t } = useTranslation();
  const [tabsRef, overflow] = useOverflowFade<HTMLUListElement>();

  return (
    <div className={s.statusBar}>
      <div className={s.tabsWrapper}>
        <ul
          ref={tabsRef}
          className={s.statusTabs}
          style={
            {
              '--fade-start': overflow.start ? FADE_WIDTH : '0px',
              '--fade-end': overflow.end ? FADE_WIDTH : '0px',
            } as CSSProperties
          }
        >
          {items.map(({ status, to, isActive, count, dot = true }) => {
            const displayStatus = t(
              dynamicTranslationKey(`QUEUE.STATUS.${status.toUpperCase()}`)
            ).toLocaleUpperCase();

            return (
              <li key={status} className={s[toCamelCase(status)]}>
                <NavLink to={to} activeClassName={s.isActive} isActive={isActive}>
                  {dot && <span className={s.dot} />}
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
