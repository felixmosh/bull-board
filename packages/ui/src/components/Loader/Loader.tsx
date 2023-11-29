import React from 'react';
import { useTranslation } from 'react-i18next';

export const Loader = () => {
  const { t } = useTranslation();
  return <div>{t('LOADING')}</div>;
};
