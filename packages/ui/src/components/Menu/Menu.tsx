import { AppQueue } from '@bull-board/api/typings/app';
import React from 'react';
import { NavLink } from 'react-router-dom';
import { STATUS_LIST } from '../../constants/status-list';
import { Store } from '../../hooks/useStore';
import s from './Menu.module.css';

export const Menu = ({
  queues,
  selectedStatuses,
}: {
  queues: AppQueue[] | undefined;
  selectedStatuses: Store['selectedStatuses'];
}) => (
  <aside className={s.aside}>
    <div>QUEUES</div>
    <nav>
      {!!queues && (
        <ul className={s.menu}>
          {queues.map(({ name: queueName, isPaused }) => (
            <li key={queueName}>
              <NavLink
                to={`/queue/${encodeURIComponent(queueName)}${
                  !selectedStatuses[queueName] || selectedStatuses[queueName] === STATUS_LIST[0]
                    ? ''
                    : `?status=${selectedStatuses[queueName]}`
                }`}
                activeClassName={s.active}
                title={queueName}
              >
                {queueName} {isPaused && <span className={s.isPaused}>[ Paused ]</span>}
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </nav>
    <div className={s.appVersion}>{process.env.APP_VERSION}</div>
  </aside>
);
