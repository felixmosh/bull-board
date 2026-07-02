import cn from 'clsx';
import React, { PropsWithChildren } from 'react';
import s from './Field.module.css';

interface FieldProps {
  label?: string;
  id?: string;
  inline?: boolean;
  description?: string;
}

export const Field = ({
  label,
  id,
  inline,
  description,
  children,
}: PropsWithChildren<FieldProps>) => (
  <div className={cn(s.field, { [s.inline]: inline })}>
    {!!label && !inline && <label htmlFor={id}>{label}</label>}
    {children}
    {!!label && inline && <label htmlFor={id}>{label}</label>}
    {!!description && <span className={s.description}>{description}</span>}
  </div>
);
