import React, { PropsWithChildren, ReactElement } from 'react';
import s from './StickyHeader.module.css';

export const StickyHeader = React.forwardRef<
  HTMLDivElement,
  PropsWithChildren<{ actions: ReactElement }>
>(({ actions, children }, ref) => (
  <div ref={ref} className={s.stickyHeader}>
    {children}
    {!!actions && <div className={s.actionContainer}>{actions}</div>}
  </div>
));
