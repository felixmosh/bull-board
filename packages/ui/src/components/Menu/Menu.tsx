import cn from 'clsx';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { useSelectedStatuses } from '../../hooks/useSelectedStatuses';
import { useQueues } from './../../hooks/useQueues';
import { links } from '../../utils/links';
import { SearchIcon } from '../Icons/Search';
import s from './Menu.module.css';

export const Menu = () => {
  const { t } = useTranslation();
  const { queues } = useQueues();

  const selectedStatuses = useSelectedStatuses();
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <aside className={s.aside}>
      <div className={s.secondary}>{t('MENU.QUEUES')}</div>

      {(queues?.length || 0) > 5 && (
        <div className={s.searchWrapper}>
          <SearchIcon />
          <input
            className={s.search}
            type="search"
            id="search-queues"
            placeholder={t('MENU.SEARCH_INPUT_PLACEHOLDER')}
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
                    {queueName}{' '}
                    {isPaused && <span className={s.isPaused}>[ {t('MENU.PAUSED')} ]</span>}
                  </NavLink>
                </li>
              ))}
          </ul>
        )}
      </nav>
        <a className={cn(s.appVersion, s.secondary)} target="_blank" rel="noreferrer"
           href="https://github.com/felixmosh/bull-board/releases"
        >{process.env.APP_VERSION}</a>
    </aside>
  );
};
