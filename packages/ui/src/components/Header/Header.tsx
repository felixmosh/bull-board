import cn from 'clsx';
import React, { PropsWithChildren, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { useMobileQuery } from '../../hooks/useMobileQuery';
import { useSettingsStore } from '../../hooks/useSettings';
import { useUIConfig } from '../../hooks/useUIConfig';
import { MobileQueueDropdown } from './MobileQueueDropdown/MobileQueueDropdown';
import s from './Header.module.css';

export const Header = ({ children }: PropsWithChildren<any>) => {
  const uiConfig = useUIConfig();
  const { showEnvBadge, theme } = useSettingsStore(
    useShallow(({ showEnvBadge, theme }) => ({
      showEnvBadge,
      theme,
    }))
  );
  const isMobile = useMobileQuery();
  const boardTitle = uiConfig.boardTitle ?? 'Bull Dashboard';
  const environment = showEnvBadge ? uiConfig.environment : undefined;

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
      className={cn(s.header, { [s.withEnvBadge]: !!environment })}
      style={
        {
          '--badge-bg': environment?.color,
          '--badge-color': environment?.textColor,
          '--badge-font-size': environment?.fontSize,
        } as React.CSSProperties
      }
    >
      {!!environment && <div className={s.envBadge}>{environment.label}</div>}

      <NavLink to="/" className={s.logo}>
        {!!uiConfig.boardLogo && 'light' in uiConfig.boardLogo && uiConfig.boardLogo.light.path && (
          <picture className={s.img}>
            {!!uiConfig.boardLogo.dark?.path && theme !== 'light' && (
              <source
                srcSet={uiConfig.boardLogo.dark.path}
                media="(prefers-color-scheme: dark)"
                width={uiConfig.boardLogo.dark.width || uiConfig.boardLogo.light.width}
                height={uiConfig.boardLogo.dark.height || uiConfig.boardLogo.light.height}
              />
            )}
            <img
              src={uiConfig.boardLogo.light.path}
              width={uiConfig.boardLogo.light.width}
              height={uiConfig.boardLogo.light.height}
              alt={boardTitle}
            />
          </picture>
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
