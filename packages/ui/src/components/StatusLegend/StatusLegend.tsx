import React from 'react';
import { queueStatsStatusList } from '../../constants/queue-stats-status';
import s from './StatusLegend.module.css';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toCamelCase } from '../../utils/toCamelCase';
import cn from 'clsx';
import { useQuery } from '../../hooks/useQuery';

export const StatusLegend = () => {
  const { t } = useTranslation();
  const query = useQuery();

  return (
    <ul className={s.legend}>
      {queueStatsStatusList.map((status) => {
        const displayStatus = t(`QUEUE.STATUS.${status.toUpperCase()}`).toLocaleUpperCase();

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
