import { Switch, type SwitchRootProps } from '@base-ui/react/switch';
import React from 'react';
import { Field } from '../Field/Field';
import s from './SwitchField.module.css';

interface SwitchFieldProps extends SwitchRootProps {
  label?: string;
  id?: string;
}

export const SwitchField = ({ label, id, ...switchProps }: SwitchFieldProps) => (
  <Field label={label} id={id} inline={true}>
    <Switch.Root id={id} {...switchProps} className={s.switch}>
      <Switch.Thumb className={s.thumb} />
    </Switch.Root>
  </Field>
);
