import { SwitchProps } from '@radix-ui/react-switch';
import * as Switch from '@radix-ui/react-switch';
import React from 'react';
import { Field } from '../Field/Field';
import s from './SwitchField.module.css';
import classNames from 'classnames/bind';
import { useSettingsStore } from '../../../hooks/useSettings';

const cx = classNames.bind(s);

interface SwitchFieldProps extends SwitchProps {
  label?: string;
  id?: string;
}

export const SwitchField = ({ label, id, ...switchProps }: SwitchFieldProps) => {
  const { darkMode } = useSettingsStore();
  return(
  <Field label={label} id={id} inline={true}>
    <Switch.Root id={id} {...switchProps} className={cx(s.switch, {dark: darkMode})}>
      <Switch.Thumb className={s.thumb} />
    </Switch.Root>
  </Field>
)};
