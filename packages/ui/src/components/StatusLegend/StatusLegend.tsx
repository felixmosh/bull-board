import React from 'react';
import { queueStatsStatusList } from '../../constants/queue-stats-status';
import { toCamelCase } from '../../utils/toCamelCase';
import s from './StatusLegend.module.css';

export const StatusLegend = () => (
  <ul className={s.legend}>
    {queueStatsStatusList.map((status) => (
      <li key={status} className={s[toCamelCase(status)]}>
        {status}
      </li>
    ))}
  </ul>
);
