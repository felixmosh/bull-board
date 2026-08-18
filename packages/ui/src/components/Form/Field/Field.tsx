import { Field as BaseField } from '@base-ui/react/field';
import cn from 'clsx';
import { PropsWithChildren } from 'react';
import s from './Field.module.css';

interface FieldProps {
  label?: string;
  inline?: boolean;
  description?: string;
}

export const Field = ({ label, inline, description, children }: PropsWithChildren<FieldProps>) => {
  const labelElement = !!label && <BaseField.Label>{label}</BaseField.Label>;

  return (
    <BaseField.Root className={cn(s.field, { [s.inline]: inline })}>
      {!inline && labelElement}
      {children}
      {inline && labelElement}
      {!!description && (
        <BaseField.Description className={s.description}>{description}</BaseField.Description>
      )}
    </BaseField.Root>
  );
};
