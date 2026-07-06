import cn from 'clsx';
import { PropsWithChildren, useId } from 'react';
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
}: PropsWithChildren<CollapsibleSectionProps>) => {
  const regionId = useId();

  return (
    <div className={cn(s.section, open && s.sectionOpen)}>
      <button
        type="button"
        className={s.header}
        aria-expanded={open}
        aria-controls={regionId}
        onClick={onToggle}
      >
        <span className={s.title}>{title}</span>
        <ChevronDown className={cn(s.chevron, open && s.chevronOpen)} />
      </button>
      <div id={regionId} className={s.reveal} role="region" aria-hidden={!open}>
        <div className={s.revealInner}>
          <div className={s.body}>{children}</div>
        </div>
      </div>
    </div>
  );
};
