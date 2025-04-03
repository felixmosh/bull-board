import cn from 'clsx';
import { useTranslation } from 'react-i18next';
import { useSelectedStatuses } from '../../../hooks/useSelectedStatuses';
import { links } from '../../../utils/links';
import { AppQueueTreeNode } from '../../../utils/toTree';
import { NavLink } from 'react-router-dom';
import React from 'react';
import s from './MenuTree.module.css';

export const MenuTree = ({ tree, level = 0 }: { tree: AppQueueTreeNode; level?: number }) => {
  const { t } = useTranslation();
  const selectedStatuses = useSelectedStatuses();

  return (
    <ul className={cn(s.menu, level > 0 && s[`level-${level}`])}>
      {tree.children.map((node) => {
        const isLeafNode = !node.children.length;
        const displayName = isLeafNode ? node.queue?.displayName : node.name;

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
              <details key={node.name} open>
                <summary>{displayName}</summary>
                <MenuTree tree={node} level={level + 1} />
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );
};
