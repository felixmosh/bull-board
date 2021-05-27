import React from 'react';
import s from './Button.module.css';
import cn from 'clsx';

export const Button = ({
  children,
  className,
  isActive = false,
  ...rest
}: React.DetailedHTMLProps<React.ButtonHTMLAttributes<HTMLButtonElement>, HTMLButtonElement> & {
  isActive?: boolean;
}) => (
  <button type="button" {...rest} className={cn(s.button, className, { [s.isActive]: isActive })}>
    {children}
  </button>
);
