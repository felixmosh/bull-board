import { Content, DropdownMenuContentProps } from '@radix-ui/react-dropdown-menu';
import React from 'react';
import s from './DropdownContent.module.css';

export const DropdownContent = React.forwardRef((props: DropdownMenuContentProps, ref: any) => (
  <Content {...props} ref={ref} className={s.content} />
));
