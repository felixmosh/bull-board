import { Menu } from '@base-ui/react/menu';
import type { MenuPopupProps } from '@base-ui/react/menu';
import cn from 'clsx';
import React from 'react';
import s from './DropdownContent.module.css';

export const DropdownContent = React.forwardRef(
  ({ className, ...props }: MenuPopupProps, ref: any) => (
    <Menu.Popup {...props} ref={ref} className={cn(s.content, className)} />
  )
);
