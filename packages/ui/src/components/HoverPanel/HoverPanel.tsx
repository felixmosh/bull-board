import { PreviewCard } from '@base-ui/react/preview-card';
import cn from 'clsx';
import { PointerEvent, ReactNode, useState } from 'react';
import { Link, LinkProps } from 'react-router-dom';
import s from './HoverPanel.module.css';

export interface HoverPanelRow {
  id: string;
  /** Any CSS colour, usually a status token. */
  color: string;
  label: string;
  value: ReactNode;
  /** Turns the row into a link to a filtered view. */
  to?: LinkProps['to'];
}

interface HoverPanelProps {
  rows: HoverPanelRow[];
  /** Accessible name for the trigger, since the trigger itself is a graphic. */
  triggerLabel: string;
  children: ReactNode;
  className?: string;
}

/**
 * Hover panel matching the look of the chart tooltips, for detail that does not fit
 * on a surface. Built on PreviewCard rather than Tooltip so the rows stay reachable
 * with the pointer and can be links.
 */
export const HoverPanel = ({ rows, triggerLabel, children, className }: HoverPanelProps) => {
  const [open, setOpen] = useState(false);

  /**
   * PreviewCard opens on hover only (`mouseOnly`), which leaves the panel unreachable on a
   * touch screen. A tap opens it there instead. Mouse presses are left alone so a click on an
   * already-hovered trigger does not close the panel out from under the pointer.
   */
  const openOnTap = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse') {
      return;
    }

    setOpen((isOpen) => !isOpen);
  };

  return (
    <PreviewCard.Root open={open} onOpenChange={setOpen}>
      <PreviewCard.Trigger
        delay={140}
        closeDelay={80}
        render={
          <button
            type="button"
            aria-label={triggerLabel}
            aria-expanded={open}
            className={cn(s.trigger, className)}
            onPointerUp={openOnTap}
          />
        }
      >
        {children}
      </PreviewCard.Trigger>
      <PreviewCard.Portal>
        {/* Opens downward so it never covers the title of the surface it belongs to. */}
        <PreviewCard.Positioner side="bottom" align="start" sideOffset={8} className={s.positioner}>
          <PreviewCard.Popup className={s.popup}>
            {rows.map((row) => {
              const content = (
                <>
                  <span className={s.swatch} style={{ backgroundColor: row.color }} />
                  <span className={s.name}>{row.label}</span>
                  <span className={s.value}>{row.value}</span>
                </>
              );

              return row.to ? (
                <Link key={row.id} to={row.to} className={cn(s.row, s.rowLink)}>
                  {content}
                </Link>
              ) : (
                <div key={row.id} className={s.row}>
                  {content}
                </div>
              );
            })}
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  );
};
