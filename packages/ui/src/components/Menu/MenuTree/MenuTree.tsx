import cn from 'clsx';
import { useTranslation } from 'react-i18next';
import { useSelectedStatuses } from '../../../hooks/useSelectedStatuses';
import { links } from '../../../utils/links';
import { AppQueueTreeNode } from '../../../utils/toTree';
import { NavLink } from 'react-router-dom';
import React from 'react';
import s from './MenuTree.module.css';
import { useSettingsStore } from '../../../hooks/useSettings';
import { MenuTreeNodeStats } from './MenuTreeNodeStats/MenuTreeNodeStats';

export const MenuTree = ({ tree, level = 0 }: { tree: AppQueueTreeNode; level?: number }) => {
  const { t } = useTranslation();
  const { showQueueStatsInMenuTree } = useSettingsStore();
  const selectedStatuses = useSelectedStatuses();

  return (
    <ul className={cn(s.menu, level > 0 && s[`level-${level}`])}>
      {tree.children.map((node) => {
        const isLeafNode = !node.children.length;

        return (
          <li key={node.name}>
            {isLeafNode ? (
              <NavLink
                to={links.queuePage(node.queue!.name, selectedStatuses)}
                activeClassName={s.active}
                title={node.name}
              >
                {node.name}
                {node.queue?.isPaused && <span className={s.isPaused}>[ {t('MENU.PAUSED')} ]</span>}
                {showQueueStatsInMenuTree && <MenuTreeNodeStats treeNode={node} />}
              </NavLink>
            ) : (
              <details key={node.name} open>
                <summary>{node.name}</summary>
                <MenuTree tree={node} level={level + 1} />
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );
};
