import cn from 'clsx';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useConnectionFilterStore } from '../../hooks/useConnectionFilterStore';
import { useDisplayGroupFilterStore } from '../../hooks/useDisplayGroupFilterStore';
import { useQueueFilterStore } from '../../hooks/useQueueFilterStore';
import { useQueues } from '../../hooks/useQueues';
import { toTree } from '../../utils/toTree';
import { SearchIcon } from '../Icons/Search';
import s from './Menu.module.css';
import { MenuTree } from './MenuTree/MenuTree';

export const Menu = () => {
  const { t } = useTranslation();
  const { queues } = useQueues();
  const { searchTerm, setSearchTerm } = useQueueFilterStore();
  const { disabledConnections } = useConnectionFilterStore();
  const { disabledDisplayGroups } = useDisplayGroupFilterStore();

  const tree = toTree(
    queues?.filter(
      (queue: any) =>
        queue.name?.toLowerCase().includes(searchTerm?.toLowerCase() as string) &&
        (!queue.connection || !disabledConnections.has(queue.connection)) &&
        (!queue.displayGroup || !disabledDisplayGroups.has(queue.displayGroup))
    ) || []
  );

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
        <MenuTree tree={tree} />
      </nav>
      <a
        className={cn(s.appVersion, s.secondary)}
        target="_blank"
        rel="noreferrer"
        href={process.env.BULL_BOARD_REPO}
      >
        {process.env.APP_VERSION}
      </a>
    </aside>
  );
};
