import { Select } from '@base-ui/react/select';
import cn from 'clsx';
import { CheckIcon } from '../../Icons/Check';
import { ChevronDown } from '../../Icons/ChevronDown';
import { Field } from '../Field/Field';
import s from './SelectField.module.css';

export interface SelectItem {
  text: string;
  value: string;
}

interface SelectFieldProps {
  label?: string;
  id?: string;
  name?: string;
  className?: string;
  options: SelectItem[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

export const SelectField = ({
  label,
  id,
  name,
  className,
  options,
  value,
  defaultValue,
  onChange,
  required,
  disabled,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: SelectFieldProps) => (
  <Field label={label} id={id}>
    <Select.Root
      id={id}
      name={name}
      items={options.map(({ text, value: optionValue }) => ({ label: text, value: optionValue }))}
      value={value}
      defaultValue={defaultValue}
      onValueChange={(next) => onChange?.(next as string)}
      required={required}
      disabled={disabled}
    >
      <Select.Trigger
        className={cn(s.trigger, { [s.labelled]: !!label }, className)}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
      >
        <Select.Value className={s.value} />
        <Select.Icon className={s.icon}>
          <ChevronDown />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        {/* Base UI defaults to laying the selected item over the trigger, which on the twelve
            entry language list means a popup taller than the modal it opens in. Anchored below
            the trigger instead, so the popup can scroll inside its own max-height. */}
        <Select.Positioner className={s.positioner} sideOffset={4} alignItemWithTrigger={false}>
          <Select.Popup className={s.popup}>
            <Select.List>
              {options.map((option) => (
                <Select.Item key={option.value} value={option.value} className={s.item}>
                  {/* Kept mounted so the check column exists on every row: without it the
                      unselected rows lose their first grid cell and their labels wrap. */}
                  <Select.ItemIndicator className={s.indicator} keepMounted>
                    <CheckIcon />
                  </Select.ItemIndicator>
                  <Select.ItemText>{option.text}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  </Field>
);
