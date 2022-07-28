import cn from 'clsx';
import React, { PropsWithChildren } from 'react';
import s from './Header.module.css';
import { getStaticPath } from '../../utils/getStaticPath';

export const Header = ({ children }: PropsWithChildren<any>) => (
  <header className={s.header}>
    <div className={s.logo}>
      <img src={getStaticPath('/images/logo.svg')} alt="Bull Dashboard" />
      Bull Dashboard
    </div>
    <div className={cn(s.content, { [s.positionRight]: React.Children.count(children) === 1 })}>
      {children}
    </div>
  </header>
);
