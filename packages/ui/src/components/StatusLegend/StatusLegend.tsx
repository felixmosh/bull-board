import React from 'react';
import { queueStatsStatusList } from '../../constants/queue-stats-status';
import { links } from '../../utils/links';
import s from './StatusLegend.module.css';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toCamelCase } from '../../utils/toCamelCase';
import { useQuery } from '../../hooks/useQuery';

export const StatusLegend = () => {
  const { t } = useTranslation();
  const query = useQuery();

  return (
    <ul className={s.legend}>
      {queueStatsStatusList.map((status) => {
        const displayStatus = t(`QUEUE.STATUS.${status.toUpperCase()}`).toLocaleUpperCase();
        const isActive = query.get('status') === status;

        return (
          <li key={status} className={s[toCamelCase(status)]}>
            <NavLink
              to={links.dashboardPage(!isActive ? status : undefined)}
              activeClassName={s.active}
              isActive={() => isActive}
            >
              <span title={displayStatus}>{displayStatus}</span>
            </NavLink>
          </li>
        );
      })}
    </ul>
  );
};
