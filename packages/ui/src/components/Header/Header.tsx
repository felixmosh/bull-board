import cn from 'clsx';
import React, { PropsWithChildren } from 'react';
import { useUIConfig } from '../../hooks/useUIConfig';
import { getStaticPath } from '../../utils/getStaticPath';
import classNames from 'classnames/bind';
import s from './Header.module.css';
import { useSettingsStore } from '../../hooks/useSettings';
const cx = classNames.bind(s);

export const Header = ({ children }: PropsWithChildren<any>) => {
  const uiConfig = useUIConfig();
  const darkMode = useSettingsStore().darkMode;
  const logoPath = uiConfig.boardLogo?.path ?? getStaticPath('/images/logo.svg');
  const boardTitle = uiConfig.boardTitle ?? 'Bull Dashboard';
 
  return (
    <header className={cx('header', { dark: darkMode})}>
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
      <div className={s.content}>{children}</div>
    </header>
  );
};
