import React from 'react';
import { queueStatsStatusList } from '../../constants/queue-stats-status';
import s from './StatusLegend.module.css';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toCamelCase } from '../../utils/toCamelCase';
import cn from 'clsx';

export const StatusLegend = () => {
  const { t } = useTranslation();
  const { search } = useLocation();

  return (
    <ul className={s.legend}>
      {queueStatsStatusList.map((status) => {
        const displayStatus = t(`QUEUE.STATUS.${status.toUpperCase()}`).toLocaleUpperCase();

        const query = new URLSearchParams(search);

        return (<li key={status} className={cn(s[toCamelCase(status)], {
          [s.isSelected]: query.get('status') === status,
        })}>
          <NavLink
            to={`/?status=${status}`}
            key={`overview-${status}`}
          >
            <span title={displayStatus}>{displayStatus}</span>
          </NavLink>
        </li>);
      })}
    </ul>
  );
};
