import { useTranslation } from 'react-i18next';
import { useSelectedStatuses } from '../../../hooks/useSelectedStatuses';
import { links } from '../../../utils/links';
import { AppQueueTreeNode } from '../../../utils/toTree';
import { NavLink } from 'react-router-dom';
import React from 'react';

export const QueueTree = ({
  tree,
  classNames: s,
}: {
  tree: AppQueueTreeNode;
  classNames: Record<string, string>;
}) => {
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
            <QueueTree tree={node} classNames={s} />
          </details>
        );
      })}
    </div>
  );
};
