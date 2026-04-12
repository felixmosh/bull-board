import React from 'react';
import s from './Button.module.css';
import cn from 'clsx';

interface ButtonProps extends React.DetailedHTMLProps<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  HTMLButtonElement
> {
  isActive?: boolean;
  theme?: 'basic' | 'primary' | 'default';
  compact?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { children, className, isActive = false, theme = 'default', compact, ...rest }: ButtonProps,
    forwardedRef
  ) => (
    <button
      type="button"
      ref={forwardedRef}
      {...rest}
      className={cn(className, s.button, s[theme], {
        [s.isActive]: isActive,
        [s.compact]: compact,
      })}
    >
      {children}
    </button>
  )
);
