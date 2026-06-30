import cn from 'clsx';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useOverviewState } from '../../hooks/useMenuState';
import { useQueues } from '../../hooks/useQueues';
import {
  aggregateCounts,
  areAllPaused,
  collectQueueNames,
  countPausedQueues,
  countQueues,
  type AggregatedCounts,
} from '../../utils/queueTreeCounts';
import { AppQueueTreeNode } from '../../utils/toTree';
import { ChevronDown } from '../Icons/ChevronDown';
import { PauseIcon } from '../Icons/Pause';
import { PlayIcon } from '../Icons/Play';
import { QueueCard } from '../QueueCard/QueueCard';
import s from './OverviewTree.module.css';

const toDomId = (path: string) => `overview-group-${path.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

const AggregateCounts = ({ counts }: { counts: AggregatedCounts }) => {
  const { t } = useTranslation();

  if (counts.total === 0) {
    return <span className={s.countsEmpty}>{t('DASHBOARD.JOBS_COUNT', { count: 0 })}</span>;
  }

  return (
    <span className={s.counts}>
      {counts.statuses.map((status) => (
        <span
          key={status}
          className={s.countChip}
          title={t(`QUEUE.STATUS.${status.toUpperCase()}`)}
        >
          <span className={s.countDot} style={{ backgroundColor: `var(--${status})` }} />
          {counts.byStatus[status]}
        </span>
      ))}
    </span>
  );
};

const GroupBulkAction = ({ node }: { node: AppQueueTreeNode }) => {
  const { t } = useTranslation();
  const { actions } = useQueues();
  const queueNames = collectQueueNames(node, { writableOnly: true });

  if (!queueNames.length) {
    return null;
  }

  const allPaused = areAllPaused(node);

  return allPaused ? (
    <button
      type="button"
      className={s.groupAction}
      onClick={actions.resumeQueues(queueNames)}
      title={t('QUEUE.ACTIONS.RESUME_GROUP')}
      aria-label={t('QUEUE.ACTIONS.RESUME_GROUP')}
    >
      <PlayIcon />
    </button>
  ) : (
    <button
      type="button"
      className={s.groupAction}
      onClick={actions.pauseQueues(queueNames)}
      title={t('QUEUE.ACTIONS.PAUSE_GROUP')}
      aria-label={t('QUEUE.ACTIONS.PAUSE_GROUP')}
    >
      <PauseIcon />
    </button>
  );
};

const OverviewGroup = ({
  node,
  level,
  parentPath,
  searchActive,
}: {
  node: AppQueueTreeNode;
  level: number;
  parentPath: string;
  searchActive: boolean;
}) => {
  const { t } = useTranslation();
  const menuPath = parentPath ? `${parentPath}/${node.name}` : node.name;
  const storedOpen = useOverviewState((state) => state.isMenuOpen(menuPath));
  const toggleMenu = useOverviewState((state) => state.toggleMenu);
  const isOpen = searchActive || storedOpen;

  const total = countQueues(node);
  const paused = countPausedQueues(node);
  const counts = aggregateCounts(node);
  const regionId = toDomId(menuPath);

  return (
    <section className={s.group} data-level={level}>
      <div className={s.groupHeaderRow}>
        <button
          type="button"
          className={s.groupHeader}
          aria-expanded={isOpen}
          aria-controls={regionId}
          onClick={() => toggleMenu(menuPath)}
          disabled={searchActive}
        >
          <ChevronDown className={cn(s.chevron, isOpen && s.chevronOpen)} />
          <span className={s.groupName} title={node.name}>
            {node.name}
          </span>
          <span className={s.groupCount}>
            {total}
            {paused > 0 && (
              <span className={s.groupPausedCount}>
                {' · '}
                {paused} {t('MENU.PAUSED').toLowerCase()}
              </span>
            )}
          </span>
        </button>
        <div className={s.groupMeta}>
          <AggregateCounts counts={counts} />
          <GroupBulkAction node={node} />
        </div>
      </div>
      {isOpen && (
        <div id={regionId} className={s.groupBody}>
          <OverviewTree
            tree={node}
            level={level + 1}
            parentPath={menuPath}
            searchActive={searchActive}
          />
        </div>
      )}
    </section>
  );
};

export const OverviewTree = ({
  tree,
  level = 0,
  parentPath = '',
  searchActive = false,
}: {
  tree: AppQueueTreeNode;
  level?: number;
  parentPath?: string;
  searchActive?: boolean;
}) => {
  const groups = tree.children.filter((node) => node.children.length > 0);
  const leaves = tree.children.filter((node) => node.children.length === 0 && node.queue);

  return (
    <div className={s.tree}>
      {groups.map((node) => (
        <OverviewGroup
          key={node.name}
          node={node}
          level={level}
          parentPath={parentPath}
          searchActive={searchActive}
        />
      ))}
      {leaves.length > 0 && (
        <ul className={s.grid}>
          {leaves.map((node) => {
            const queue = node.queue!;
            const label =
              queue.displayName && queue.displayName !== queue.name ? queue.displayName : node.name;
            return (
              <li key={node.name}>
                <QueueCard queue={queue} displayName={label} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
