import cn from 'clsx';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { useMenuState } from '../../../hooks/useMenuState';
import { useSelectedStatuses } from '../../../hooks/useSelectedStatuses';
import { links } from '../../../utils/links';
import { AppQueueTreeNode } from '../../../utils/toTree';
import { ChevronDown } from '../../Icons/ChevronDown';
import s from './MenuTree.module.css';

function countQueues(node: AppQueueTreeNode): number {
  if (!node.children.length) return node.queue ? 1 : 0;
  return node.children.reduce((sum, child) => sum + countQueues(child), 0);
}

function countPausedQueues(node: AppQueueTreeNode): number {
  if (!node.children.length) return node.queue?.isPaused ? 1 : 0;
  return node.children.reduce((sum, child) => sum + countPausedQueues(child), 0);
}

export const MenuTree = ({
  tree,
  level = 0,
  parentPath = '',
}: {
  tree: AppQueueTreeNode;
  level?: number;
  parentPath?: string;
}) => {
  const { t } = useTranslation();
  const selectedStatuses = useSelectedStatuses();
  const { toggleMenu, isMenuOpen } = useMenuState(({ toggleMenu, isMenuOpen }) => ({
    isMenuOpen,
    toggleMenu,
  }));

  return (
    <ul className={cn(s.menu, level > 0 && s[`level-${level}`])}>
      {tree.children.map((node) => {
        const isLeafNode = !node.children.length;
        const displayName = node.name;
        const menuPath = parentPath ? `${parentPath}/${node.name}` : node.name;
        const isOpen = isMenuOpen(menuPath);

        return (
          <li key={node.name}>
            {isLeafNode ? (
              <NavLink
                to={links.queuePage(node.queue!.name, selectedStatuses)}
                activeClassName={s.active}
                title={displayName}
              >
                <span className={s.queueName}>{displayName}</span>
                {node.queue?.isPaused && <span className={s.isPaused}>[ {t('MENU.PAUSED')} ]</span>}
              </NavLink>
            ) : (
              <>
                <button
                  className={s.groupHeader}
                  onClick={() => toggleMenu(menuPath)}
                >
                  <ChevronDown className={cn(s.chevron, isOpen && s.chevronOpen)} />
                  <span className={s.groupName}>{displayName}</span>
                  <span className={s.groupCount}>
                    {countQueues(node)}
                    {countPausedQueues(node) > 0 && (
                      <span className={s.groupPausedCount}>
                        {' · '}{countPausedQueues(node)} {t('MENU.PAUSED').toLowerCase()}
                      </span>
                    )}
                  </span>
                </button>
                {isOpen && <MenuTree tree={node} level={level + 1} parentPath={menuPath} />}
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
};
