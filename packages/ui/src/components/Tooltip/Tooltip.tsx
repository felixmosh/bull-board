import React from 'react';
import s from './Tooltip.module.css';

export const Tooltip = ({ title, children }: React.PropsWithChildren<{ title: string }>) => (
  <span data-title={title} className={s.tooltip}>
    {children}
  </span>
);
