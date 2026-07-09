import type { ReactNode } from 'react';
import s from './MetricsSummary.module.css';

interface MetricsSummaryProps {
  children: ReactNode;
}

export const MetricsSummary = ({ children }: MetricsSummaryProps) => (
  <div className={s.summary}>{children}</div>
);

interface StatTileProps {
  value: ReactNode;
  label: string;
  dotColor?: string;
  /** Optional caller-supplied class appended after the base value style, for page-specific overrides (e.g. font-size). */
  valueClassName?: string;
}

export const StatTile = ({ value, label, dotColor, valueClassName }: StatTileProps) => (
  <div className={s.stat}>
    <div className={s.statValueRow}>
      {dotColor ? <span className={s.statDot} style={{ backgroundColor: dotColor }} /> : null}
      <span className={valueClassName ? `${s.statValue} ${valueClassName}` : s.statValue}>
        {value}
      </span>
    </div>
    <span className={s.statLabel}>{label}</span>
  </div>
);
