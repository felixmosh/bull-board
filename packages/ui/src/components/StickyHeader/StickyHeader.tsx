import React, { PropsWithChildren } from 'react';
import s from './StickyHeader.module.css';

export const StickyHeader = ({
  actions,
  children,
}: PropsWithChildren<{ actions: React.ReactElement }>) => (
  <div className={s.stickyHeader}>
    {children}
    {!!actions && <div className={s.actionContainer}>{actions}</div>}
  </div>
);
