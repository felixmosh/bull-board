import type { AppQueue } from '@bull-board/api/typings/app';
import { useCallback } from 'react';
import { useSettingsStore } from './useSettings';
import { QueueSortKey, sortTree, toTree } from '../utils/toTree';

export interface QueueGroup {
  [key: string]: AppQueue[] | QueueGroup;
}

export function useSortQueues(queues: AppQueue[]) {
  const {
    sorting: {
      dashboard: { key: sortKey, direction: sortDirection },
    },
    setSettings,
  } = useSettingsStore(({ setSettings, sorting }) => ({ sorting, setSettings }));

  const tree = toTree(queues.filter((queue) => queue.name.toLowerCase()));

  const sortedTree = sortTree(tree, sortKey, sortDirection);

  const onSort = useCallback(
    (newSortKey: QueueSortKey) => {
      setSettings({
        sorting: {
          dashboard: {
            key: newSortKey,
            direction: newSortKey === sortKey && sortDirection === 'asc' ? 'desc' : 'asc',
          },
        },
      });
    },
    [sortKey, sortDirection]
  );

  return { sortedTree, sortDirection, sortKey, onSort };
}
