import React, { InputHTMLAttributes } from 'react';
import { Field } from '../Field/Field';

interface InputFieldProps extends InputHTMLAttributes<any> {
  label?: string;
}

export const InputField = ({ label, id, ...inputProps }: InputFieldProps) => (
  <Field label={label} id={id}>
    <input id={id} type="text" {...inputProps} />
  </Field>
);
