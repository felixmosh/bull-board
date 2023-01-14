import classNames from 'classnames/bind';
import React, { PropsWithChildren } from 'react';
import s from './Field.module.css';
import { useSettingsStore } from '../../../hooks/useSettings';

const cx = classNames.bind(s);

interface FieldProps {
  label?: string;
  id?: string;
  inline?: boolean;
}

export const Field = ({ label, id, inline, children }: PropsWithChildren<FieldProps>) => { 
  const { darkMode } = useSettingsStore();
  return (
  <div className={cx(s.field, { [s.inline]: inline, dark: darkMode })}>
    {!!label && !inline && <label htmlFor={id}>{label}</label>}
    {children}
    {!!label && inline && <label htmlFor={id}>{label}</label>}
  </div>
)};
