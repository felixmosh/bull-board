import { t } from 'i18next';
import { useSearchQueue } from '../../providers/SearchQueueProvider';
import { SearchIcon } from '../Icons/Search';
import s from './Search.module.css';
import React from 'react';

export const Search = () => {
  const { searchTerm, setSearchTerm } = useSearchQueue();

  return (
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
  );
};
