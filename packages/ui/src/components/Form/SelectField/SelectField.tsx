import React, { SelectHTMLAttributes } from 'react';
import { Field } from '../Field/Field';

export interface SelectItem {
  text: string;
  value: string;
}

interface SelectFieldProps extends SelectHTMLAttributes<any> {
  label?: string;
  id?: string;
  options: SelectItem[];
}

export const SelectField = ({ label, id, options, ...selectProps }: SelectFieldProps) => (
  <Field label={label} id={id}>
    <select id={id} {...selectProps}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.text}
        </option>
      ))}
    </select>
  </Field>
);
