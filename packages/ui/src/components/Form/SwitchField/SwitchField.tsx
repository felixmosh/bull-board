import { Switch, type SwitchRootProps } from '@base-ui/react/switch';
import React from 'react';
import { Field } from '../Field/Field';
import s from './SwitchField.module.css';

interface SwitchFieldProps extends SwitchRootProps {
  label?: string;
  id?: string;
  description?: string;
}

export const SwitchField = ({ label, id, description, ...switchProps }: SwitchFieldProps) => (
  <Field label={label} id={id} inline={true} description={description}>
    <Switch.Root id={id} {...switchProps} className={s.switch}>
      <Switch.Thumb className={s.thumb} />
    </Switch.Root>
  </Field>
);
