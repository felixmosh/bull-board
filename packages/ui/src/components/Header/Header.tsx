import cn from 'clsx';
import React, { PropsWithChildren } from 'react';
import { NavLink } from 'react-router-dom';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useUIConfig } from '../../hooks/useUIConfig';
import { getStaticPath } from '../../utils/getStaticPath';
import { MobileQueueDropdown } from './MobileQueueDropdown/MobileQueueDropdown';
import s from './Header.module.css';

export const Header = ({ children }: PropsWithChildren<any>) => {
  const uiConfig = useUIConfig();
  const isMobile = useMediaQuery('(max-width: 768px)');
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
      {isMobile && (
        <div className={s.mobileQueueSelector}>
          <MobileQueueDropdown />
        </div>
      )}
      <div className={s.content}>{children}</div>
    </header>
  );
};
