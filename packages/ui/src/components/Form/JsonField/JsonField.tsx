import { JsonEditor as Editor } from 'jsoneditor-react';
import 'jsoneditor-react/es/editor.min.css';
import React, { HTMLProps } from 'react';
import { Field } from '../Field/Field';

interface JsonFieldProps extends HTMLProps<any> {
  label?: string;
  value?: any;
  onChange?: (v: any) => void;
  onValidationError?: (errors: Error[]) => void;
}

export const JsonField = ({ label, id, ...props }: JsonFieldProps) => (
  <Field label={label} id={id}>
    <Editor mode="code" {...props} />
  </Field>
);
