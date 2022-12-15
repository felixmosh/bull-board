import cn from 'clsx';
import React, { PropsWithChildren } from 'react';
import { useUIConfig } from '../../hooks/useUIConfig';
import s from './Header.module.css';
import { getStaticPath } from '../../utils/getStaticPath';

export const Header = ({ children }: PropsWithChildren<any>) => {
  const uiConfig = useUIConfig();
  const logoPath = uiConfig.boardLogo?.path ?? getStaticPath('/images/logo.svg');
  const boardTitle = uiConfig.boardTitle ?? 'Bull Dashboard';
  return (
    <header className={s.header}>
      <div className={s.logo}>
        {!!logoPath && (
          <img
            src={logoPath}
            className={cn(s.img, { [s.default]: !uiConfig.boardLogo })}
            width={uiConfig.boardLogo?.width}
            height={uiConfig.boardLogo?.height}
            alt={boardTitle}
          />
        )}
        {boardTitle}
      </div>
      <div className={cn(s.content, { [s.positionRight]: React.Children.count(children) === 1 })}>
        {children}
      </div>
    </header>
  );
};
