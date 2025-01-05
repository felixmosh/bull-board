import cn from 'clsx';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { useSelectedStatuses } from '../../hooks/useSelectedStatuses';
import { useQueues } from '../../hooks/useQueues';
import { links } from '../../utils/links';
import { SearchIcon } from '../Icons/Search';
import s from './Menu.module.css';
import { AppQueueTreeNode, toTree } from '../../utils/toTree';

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
        href={process.env.BULL_BOARD_REPO}
      >
        {process.env.APP_VERSION}
      </a>
    </aside>
  );
};

function QueueTree({ tree }: { tree: AppQueueTreeNode }) {
  const { t } = useTranslation();
  const selectedStatuses = useSelectedStatuses();

  if (!tree.children.length) return null;

  return (
    <div className={s.menuLevel}>
      {tree.children.map((node) => {
        const isLeafNode = !node.children.length;

        return isLeafNode ? (
          <div key={node.name} className={s.menu}>
            <NavLink
              to={links.queuePage(node.queue!.name, selectedStatuses)}
              activeClassName={s.active}
              title={node.name}
            >
              {node.name}
              {node.queue?.isPaused && <span className={s.isPaused}>[ {t('MENU.PAUSED')} ]</span>}
            </NavLink>
          </div>
        ) : (
          <details key={node.name} className={s.menu} open>
            <summary>{node.name}</summary>
            <QueueTree tree={node} />
          </details>
        );
      })}
    </div>
  );
}
