import { AppQueue } from '@bull-board/api/typings/app';
import cn from 'clsx';
import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useSelectedStatuses } from '../../hooks/useSelectedStatuses';
import { links } from '../../utils/links';
import { SearchIcon } from '../Icons/Search';
import s from './Menu.module.css';

export const Menu = ({ queues }: { queues: AppQueue[] | null }) => {
  const selectedStatuses = useSelectedStatuses();
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <aside className={s.aside}>
      <div className={s.secondary}>QUEUES</div>

      {(queues?.length || 0) > 5 && (
        <div className={s.searchWrapper}>
          <SearchIcon />
          <input
            className={s.search}
            type="search"
            id="search-queues"
            placeholder="Filter queues"
            value={searchTerm}
            onChange={({ currentTarget }) => setSearchTerm(currentTarget.value)}
          />
        </div>
      )}
      <nav>
        {!!queues && (
          <ul className={s.menu}>
            {queues
              .filter(({ name }) =>
                name?.toLowerCase().includes(searchTerm?.toLowerCase() as string)
              )
              .map(({ name: queueName, isPaused }) => (
                <li key={queueName}>
                  <NavLink
                    to={links.queuePage(queueName, selectedStatuses)}
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
      <div className={cn(s.appVersion, s.secondary)}>{process.env.APP_VERSION}</div>
    </aside>
  );
};
