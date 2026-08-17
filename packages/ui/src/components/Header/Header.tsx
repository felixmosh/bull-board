import cn from 'clsx';
import React, { PropsWithChildren, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useMobileQuery } from '../../hooks/useMobileQuery';
import { useUIConfig } from '../../hooks/useUIConfig';
import { getStaticPath } from '../../utils/getStaticPath';
import { MobileQueueDropdown } from './MobileQueueDropdown/MobileQueueDropdown';
import s from './Header.module.css';

export const Header = ({ children }: PropsWithChildren<any>) => {
  const uiConfig = useUIConfig();
  const isMobile = useMobileQuery();
  const logoPath = uiConfig.boardLogo?.path ?? getStaticPath('/images/logo.svg');
  const boardTitle = uiConfig.boardTitle ?? 'Bull Dashboard';
  const environment = uiConfig.environment;

  /**
   * The environment badge is absolutely positioned across the top of the header, so it takes
   * no space of its own. Everything that sits below a fixed header offsets itself by
   * `--header-height`: the menu, the sticky status bar, the overview's group headers and
   * `main`. Growing that one variable moves all of them together, where padding on the header
   * alone would leave the rest tucked underneath it.
   *
   * The badge box is its font size plus the 0.25em of padding above and below it.
   */
  useEffect(() => {
    const root = document.documentElement;
    if (!environment) {
      root.style.removeProperty('--env-badge-height');
      return;
    }

    const badgeHeight = `calc(${environment.fontSize ?? '0.75rem'} * 1.5)`;
    root.style.setProperty('--env-badge-height', badgeHeight);
    return () => {
      root.style.removeProperty('--env-badge-height');
    };
  }, [environment]);

  return (
    // The badge variables live on the header rather than the badge, because the header's
    // content has to reserve the badge's height and so needs to read its font size too.
    <header
      className={cn(s.header, { [s.withEnvBadge]: !!uiConfig.environment })}
      style={
        {
          '--badge-bg': uiConfig.environment?.color,
          '--badge-color': uiConfig.environment?.textColor,
          '--badge-font-size': uiConfig.environment?.fontSize,
        } as React.CSSProperties
      }
    >
      {!!uiConfig.environment && <div className={s.envBadge}>{uiConfig.environment.label}</div>}

      <NavLink to="/" className={s.logo}>
        {!!logoPath && (
          <img
            src={logoPath}
            className={cn(s.img, { [s.default]: !uiConfig.boardLogo })}
            width={uiConfig.boardLogo?.width}
            height={uiConfig.boardLogo?.height}
            alt={boardTitle}
          />
        )}
        <span title={boardTitle}>{boardTitle}</span>
      </NavLink>
      <div className={s.content}>{children}</div>
      {isMobile && (
        <div className={s.mobileQueueSelector}>
          <MobileQueueDropdown />
        </div>
      )}
    </header>
  );
};
