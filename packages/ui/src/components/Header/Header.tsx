import cn from 'clsx';
import React, { PropsWithChildren } from 'react';
import { NavLink } from 'react-router-dom';
import { useMobileQuery } from '../../hooks/useMobileQuery';
import { useUIConfig } from '../../hooks/useUIConfig';
import { getStaticPath } from '../../utils/getStaticPath';
import s from './Header.module.css';
import { MobileQueueDropdown } from './MobileQueueDropdown/MobileQueueDropdown';

export const Header = ({ children }: PropsWithChildren<any>) => {
  const uiConfig = useUIConfig();
  const isMobile = useMobileQuery();
  const logoPath = uiConfig.boardLogo?.path ?? getStaticPath('/images/logo.svg');
  const boardTitle = uiConfig.boardTitle ?? 'Bull Dashboard';

  return (
    <header className={s.header}>
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
