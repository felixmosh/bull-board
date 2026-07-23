import { useTranslation } from 'react-i18next';
import { ChevronDown } from '../../Icons/ChevronDown';
import { RangeSelector } from '../../RangeSelector/RangeSelector';
import type { Range } from '../QueueMetrics';
import parentStyles from '../QueueMetrics.module.css';
import s from './MetricsHeader.module.css';

const RANGES: Range[] = ['60m', '7d', '30d', '90d'];

const RANGE_LABEL_KEYS: Record<
  Range,
  'METRICS.RANGE_60M' | 'METRICS.RANGE_7D' | 'METRICS.RANGE_30D' | 'METRICS.RANGE_90D'
> = {
  '60m': 'METRICS.RANGE_60M',
  '7d': 'METRICS.RANGE_7D',
  '30d': 'METRICS.RANGE_30D',
  '90d': 'METRICS.RANGE_90D',
};

interface MetricsHeaderProps {
  collapsed: boolean;
  onToggle: () => void;
  showRangeSelector: boolean;
  range: Range;
  onRangeChange: (range: Range) => void;
}

export const MetricsHeader = ({
  collapsed,
  onToggle,
  showRangeSelector,
  range,
  onRangeChange,
}: MetricsHeaderProps) => {
  const { t } = useTranslation();

  return (
    <div className={parentStyles.header}>
      <button
        type="button"
        className={s.collapseToggle}
        aria-expanded={!collapsed}
        onClick={onToggle}
        title={collapsed ? t('METRICS.SHOW') : t('METRICS.HIDE')}
      >
        <span className={s.chevronChip}>
          <ChevronDown className={collapsed ? s.chevronCollapsed : s.chevron} />
        </span>
        <h3 className={parentStyles.title}>{t('METRICS.TITLE')}</h3>
      </button>
      {!collapsed && (
        <div className={s.legend}>
          <span className={s.legendItem}>
            <span className={s.swatch} style={{ backgroundColor: 'var(--completed)' }} />
            {t('METRICS.COMPLETED')}
          </span>
          <span className={s.legendItem}>
            <span className={s.swatch} style={{ backgroundColor: 'var(--failed)' }} />
            {t('METRICS.FAILED')}
          </span>
        </div>
      )}
      {!collapsed && showRangeSelector && (
        <RangeSelector
          ranges={RANGES}
          value={range}
          onChange={onRangeChange}
          getLabel={(r) => t(RANGE_LABEL_KEYS[r])}
        />
      )}
    </div>
  );
};
