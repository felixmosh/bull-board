import React from 'react';
import s from './Button.module.css';
import cn from 'clsx';

interface ButtonProps
  extends React.DetailedHTMLProps<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    HTMLButtonElement
  > {
  isActive?: boolean;
  theme?: 'basic' | 'primary' | 'default';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { children, className, isActive = false, theme = 'default', ...rest }: ButtonProps,
    forwardedRef
  ) => (
    <button
      type="button"
      ref={forwardedRef}
      {...rest}
      className={cn(className, s.button, s[theme], {
        [s.isActive]: isActive,
      })}
    >
      {children}
    </button>
  )
);
