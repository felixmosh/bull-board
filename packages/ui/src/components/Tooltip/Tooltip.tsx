import cn from 'clsx';
import { PropsWithChildren } from 'react';
import s from './Tooltip.module.css';

interface TooltipProps {
  title: string;
  className?: string;
  /** Lets the bubble wrap onto several lines, for sentences rather than short labels. */
  multiline?: boolean;
}

export const Tooltip = ({
  title,
  className,
  multiline,
  children,
}: PropsWithChildren<TooltipProps>) => (
  <span data-title={title} className={cn(s.tooltip, multiline && s.multiline, className)}>
    {children}
  </span>
);
