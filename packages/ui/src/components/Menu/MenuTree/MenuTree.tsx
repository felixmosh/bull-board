import cn from 'clsx';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { useMenuState } from '../../../hooks/useMenuState';
import { useSelectedStatuses } from '../../../hooks/useSelectedStatuses';
import { links } from '../../../utils/links';
import { countPausedQueues, countQueues } from '../../../utils/queueTreeCounts';
import { AppQueueTreeNode } from '../../../utils/toTree';
import { ChevronDown } from '../../Icons/ChevronDown';
import s from './MenuTree.module.css';

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
    <ul
      className={cn(s.menu, level > 0 && s.level)}
      style={{ '--level': level } as React.CSSProperties}
    >
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
                <button className={s.groupHeader} onClick={() => toggleMenu(menuPath)}>
                  <ChevronDown className={cn(s.chevron, isOpen && s.chevronOpen)} />
                  <span className={s.groupName}>{displayName}</span>
                  <span className={s.groupCount}>
                    {countQueues(node)}
                    {countPausedQueues(node) > 0 && (
                      <span className={s.groupPausedCount}>
                        {' · '}
                        {countPausedQueues(node)} {t('MENU.PAUSED').toLowerCase()}
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
