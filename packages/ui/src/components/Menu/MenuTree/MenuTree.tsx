import cn from 'clsx';
import { useTranslation } from 'react-i18next';
import { useSelectedStatuses } from '../../../hooks/useSelectedStatuses';
import { useMenuState } from '../../../hooks/useMenuState';
import { links } from '../../../utils/links';
import { AppQueueTreeNode } from '../../../utils/toTree';
import { NavLink } from 'react-router-dom';
import React from 'react';
import s from './MenuTree.module.css';

export const MenuTree = ({ tree, level = 0, parentPath = '' }: { tree: AppQueueTreeNode; level?: number; parentPath?: string }) => {
  const { t } = useTranslation();
  const selectedStatuses = useSelectedStatuses();
  const { toggleMenu, isMenuOpen } = useMenuState();

  return (
    <ul className={cn(s.menu, level > 0 && s[`level-${level}`])}>
      {tree.children.map((node) => {
        const isLeafNode = !node.children.length;
        const displayName = node.name;
        const menuPath = parentPath ? `${parentPath}/${node.name}` : node.name;

        return (
          <li key={node.name}>
            {isLeafNode ? (
              <NavLink
                to={links.queuePage(node.queue!.name, selectedStatuses)}
                activeClassName={s.active}
                title={displayName}
              >
                {displayName}
                {node.queue?.isPaused && <span className={s.isPaused}>[ {t('MENU.PAUSED')} ]</span>}
              </NavLink>
            ) : (
              <details 
                key={node.name} 
                open={isMenuOpen(menuPath)}
                onToggle={(e) => {
                  e.preventDefault();
                  toggleMenu(menuPath);
                }}
              >
                <summary>{displayName}</summary>
                <MenuTree tree={node} level={level + 1} parentPath={menuPath} />
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );
};
