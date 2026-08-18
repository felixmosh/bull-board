import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';
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
  <ToggleGroup
    className={cn(s.rangeSelector, className)}
    value={[value]}
    onValueChange={(pressed) => {
      const [next] = pressed;
      if (next) {
        onChange(next as T);
      }
    }}
  >
    {ranges.map((range) => (
      <Toggle key={range} value={range} className={s.rangeButton}>
        {getLabel(range)}
      </Toggle>
    ))}
  </ToggleGroup>
);
