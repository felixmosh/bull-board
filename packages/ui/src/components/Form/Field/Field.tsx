import cn from 'clsx';
import React, { PropsWithChildren } from 'react';
import s from './Field.module.css';

interface FieldProps {
  label?: string;
  id?: string;
  inline?: boolean;
}

export const Field = ({ label, id, inline, children }: PropsWithChildren<FieldProps>) => (
  <div className={cn(s.field, { [s.inline]: inline })}>
    {!!label && !inline && <label htmlFor={id}>{label}</label>}
    {children}
    {!!label && inline && <label htmlFor={id}>{label}</label>}
  </div>
);
