import React from 'react';
import { queueStatsStatusList } from '../../constants/queue-stats-status';
import s from './StatusLegend.module.css';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toCamelCase } from '../../utils/toCamelCase';

export const StatusLegend = () => {
  const { t } = useTranslation();

  return (
    <ul className={s.legend}>
      {queueStatsStatusList.map((status) => {
        const displayStatus = t(`QUEUE.STATUS.${status.toUpperCase()}`).toLocaleUpperCase();

        return (<li key={status} className={s[toCamelCase(status)]}>
          <NavLink
            to={`/?status=${status}`}
            activeClassName={s.active}
            isActive={(_path, { search }) => {
              const query = new URLSearchParams(search);
              return query.get('status') === status;
            }}
            className={s[toCamelCase(status)]}
            key={`overview-${status}`}
          >
            <span title={displayStatus}>{displayStatus}</span>
          </NavLink>
        </li>);
      })}
    </ul>
  );
};
