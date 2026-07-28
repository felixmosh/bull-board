import { PropsWithChildren } from 'react';
import s from './Tooltip.module.css';

export const Tooltip = ({
  title,
  className,
  children,
}: PropsWithChildren<{ title: string; className?: string }>) => (
  <span data-title={title} className={className ? `${s.tooltip} ${className}` : s.tooltip}>
    {children}
  </span>
);
