import React from 'react';
import { useTranslation } from 'react-i18next';
import { queueStatsStatusList } from '../../constants/queue-stats-status';
import { toCamelCase } from '../../utils/toCamelCase';
import s from './StatusLegend.module.css';

export const StatusLegend = () => {
  const { t } = useTranslation();
  return (
    <ul className={s.legend}>
      {queueStatsStatusList.map((status) => (
        <li key={status} className={s[toCamelCase(status)]}>
          {t(`QUEUE.STATUS.${status.toUpperCase()}`)}
        </li>
      ))}
    </ul>
  );
};
