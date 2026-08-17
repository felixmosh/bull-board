import { Collapsible } from '@base-ui/react/collapsible';
import cn from 'clsx';
import { PropsWithChildren } from 'react';
import { ChevronDown } from '../Icons/ChevronDown';
import s from './CollapsibleSection.module.css';

interface CollapsibleSectionProps {
  title: string;
  open: boolean;
  onToggle: () => void;
}

export const CollapsibleSection = ({
  title,
  open,
  onToggle,
  children,
}: PropsWithChildren<CollapsibleSectionProps>) => (
  <Collapsible.Root
    open={open}
    onOpenChange={onToggle}
    render={<div className={cn(s.section, open && s.sectionOpen)} />}
  >
    <Collapsible.Trigger className={s.header}>
      <span className={s.title}>{title}</span>
      <ChevronDown className={cn(s.chevron, open && s.chevronOpen)} />
    </Collapsible.Trigger>
    <Collapsible.Panel className={s.panel}>
      <div className={s.body}>{children}</div>
    </Collapsible.Panel>
  </Collapsible.Root>
);
