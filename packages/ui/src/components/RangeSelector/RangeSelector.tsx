import cn from 'clsx';
import s from './RangeSelector.module.css';

interface RangeSelectorProps<T extends string> {
  ranges: readonly T[];
  value: T;
  onChange: (range: T) => void;
  getLabel: (range: T) => string;
  className?: string;
}

export const RangeSelector = <T extends string>({
  ranges,
  value,
  onChange,
  getLabel,
  className,
}: RangeSelectorProps<T>) => (
  <div className={cn(s.rangeSelector, className)} role="tablist">
    {ranges.map((range) => (
      <button
        key={range}
        type="button"
        role="tab"
        aria-selected={value === range}
        className={value === range ? s.rangeButtonActive : s.rangeButton}
        onClick={() => onChange(range)}
      >
        {getLabel(range)}
      </button>
    ))}
  </div>
);
