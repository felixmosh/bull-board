import { Button as BaseButton, type ButtonProps as BaseButtonProps } from '@base-ui/react/button';
import cn from 'clsx';
import React from 'react';
import s from './Button.module.css';

interface ButtonProps extends Omit<BaseButtonProps, 'className'> {
  className?: string;
  isActive?: boolean;
  theme?: 'basic' | 'primary' | 'default';
  compact?: boolean;
}

export const Button = React.forwardRef<HTMLElement, ButtonProps>(
  (
    { children, className, isActive = false, theme = 'default', compact, ...rest }: ButtonProps,
    forwardedRef
  ) => (
    <BaseButton
      type="button"
      ref={forwardedRef}
      {...rest}
      className={cn(className, s.button, s[theme], {
        [s.isActive]: isActive,
        [s.compact]: compact,
      })}
    >
      {children}
    </BaseButton>
  )
);
