import { Field as BaseField } from '@base-ui/react/field';
import { InputHTMLAttributes } from 'react';
import { Field } from '../Field/Field';

interface InputFieldProps extends InputHTMLAttributes<any> {
  label?: string;
}

export const InputField = ({ label, id, ...inputProps }: InputFieldProps) => (
  <Field label={label}>
    <BaseField.Control id={id} type="text" {...inputProps} />
  </Field>
);
