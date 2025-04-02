import React from 'react';
import { AppQueueTreeNode } from '../../../../utils/toTree';
import { toCamelCase } from '../../../../utils/toCamelCase';
import s from './MenuTreeNodeStats.module.css';
import { STATUSES } from '@bull-board/api/src/constants/statuses';
import { formatShortNumber } from '../../../../utils/formatNumber';
export const MenuTreeNodeStats = ({ treeNode }: { treeNode: AppQueueTreeNode }) => {
  if (!treeNode.queue || !treeNode.queue.statuses || !treeNode.queue.counts) {
    return null;
  }

  const { statuses, counts } = treeNode.queue;
  const statusesWithCounts = statuses
    .filter((status) => status !== STATUSES.latest && counts[status] >= 0)
    .map((status) => ({
      status,
      count: counts[status],
    }));

  if (!statusesWithCounts.length) {
    return null;
  }

  return (
    <ul className={s.legend}>
      {statusesWithCounts.map(({ status, count }) => (
        <li className={s[toCamelCase(status)]}>{formatShortNumber(count)}</li>
      ))}
    </ul>
  );
};
