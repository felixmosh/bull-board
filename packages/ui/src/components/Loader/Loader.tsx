import React from 'react';
import { useTranslation } from 'react-i18next';
import s from './Loader.module.css';

export const Loader = () => {
  const { t } = useTranslation();
  return (
    <div className={s.loader}>
      {t('LOADING')}
      <span className={s.dots}>
        <span />
        <span />
        <span />
      </span>
    </div>
  );
};
