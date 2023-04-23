import { queueStatsStatusList } from '../../constants/queue-stats-status';
import React from 'react';
import s from './StatusLegend.module.css';

export const StatusLegend = () => (
  <ul className={s.legend}>
    {queueStatsStatusList.map((status) => (
      <li key={status} className={s[status]}>
        {status}
      </li>
    ))}
  </ul>
);
