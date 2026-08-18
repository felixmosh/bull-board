import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';
import cn from 'clsx';
import { PropsWithChildren } from 'react';
import s from './Tooltip.module.css';

interface TooltipProps {
  title: string;
  className?: string;
}

export const Tooltip = ({ title, className, children }: PropsWithChildren<TooltipProps>) => (
  <BaseTooltip.Root>
    <BaseTooltip.Trigger render={<span className={cn(s.trigger, className)} />}>
      {children}
    </BaseTooltip.Trigger>
    <BaseTooltip.Portal>
      <BaseTooltip.Positioner className={s.positioner} side="top" sideOffset={6}>
        <BaseTooltip.Popup className={s.popup}>{title}</BaseTooltip.Popup>
      </BaseTooltip.Positioner>
    </BaseTooltip.Portal>
  </BaseTooltip.Root>
);
