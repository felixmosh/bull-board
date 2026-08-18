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

  useEffect(() => {
    if (!environment) {
      return;
    }

    // On body, not the root element: `--header-offset` is declared on `:root, .dark-mode`, and
    // `.dark-mode` sits on body, so a value on the root element loses to it everywhere inside body.
    const { style } = document.body;
    const badgeHeight = `calc(${environment.fontSize ?? '0.75rem'} * 1.5)`;
    style.setProperty('--header-offset', `calc(var(--header-height) + ${badgeHeight})`);

    return () => {
      style.removeProperty('--header-offset');
    };
  }, [environment]);

  return (
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
