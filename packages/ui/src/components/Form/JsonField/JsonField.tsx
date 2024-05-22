import React, { HTMLProps } from 'react';
import { JsonEditor } from '../../JsonEditor/JsonEditor';
import { Field } from '../Field/Field';

interface JsonFieldProps extends Omit<HTMLProps<HTMLInputElement>, 'value' | 'ref'> {
  value?: Record<any, any>;
  schema?: Record<string, any>;
}

export const JsonField = ({ label, id, value, ...rest }: JsonFieldProps) => (
  <Field label={label} id={id}>
    <JsonEditor doc={value || {}} id={id} {...rest} />
  </Field>
);
