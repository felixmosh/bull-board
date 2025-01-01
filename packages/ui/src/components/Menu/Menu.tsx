import cn from 'clsx';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { useSelectedStatuses } from '../../hooks/useSelectedStatuses';
import { useQueues } from './../../hooks/useQueues';
import { links } from '../../utils/links';
import { SearchIcon } from '../Icons/Search';
import s from './Menu.module.css';
import { AppQueueTree, toTree } from '../../utils/toTree';

export const Menu = () => {
  const { t } = useTranslation();
  const { queues } = useQueues();
  const [searchTerm, setSearchTerm] = useState('');

  const tree = toTree(
    queues?.filter((queue) =>
      queue.name?.toLowerCase().includes(searchTerm?.toLowerCase() as string)
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
        <QueueTree tree={tree} />
      </nav>
      <a
        className={cn(s.appVersion, s.secondary)}
        target="_blank"
        rel="noreferrer"
        href="https://github.com/felixmosh/bull-board/releases"
      >
        {process.env.APP_VERSION}
      </a>
    </aside>
  );
};

function QueueTree({ tree }: { tree: AppQueueTree }) {
  const { t } = useTranslation();
  const selectedStatuses = useSelectedStatuses();

  const keys = Object.keys(tree).sort();
  if (keys.length === 0) return null;

  return (
    <div className={s.menuLevel}>
      {keys.map((key) => {
        const node = tree[key];
        const isLeafNode = Object.keys(node.children).length === 0;

        return isLeafNode && node.queue?.name ? (
          <div key={key} className={s.menu}>
            <NavLink
              to={links.queuePage(node.queue?.name, selectedStatuses)}
              activeClassName={s.active}
              title={key}
            >
              {key}
              {node.queue?.isPaused && <span className={s.isPaused}>[ {t('MENU.PAUSED')} ]</span>}
            </NavLink>
          </div>
        ) : (
          <details key={key} className={s.menu} open>
            <summary>{key}</summary>
            <QueueTree tree={node.children} />
          </details>
        );
      })}
    </div>
  );
}
