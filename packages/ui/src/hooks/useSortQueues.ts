import type { AppQueue } from '@bull-board/api/typings/app';
import { useCallback } from 'react';
import { useSettingsStore } from './useSettings';

export type QueueSortKey = 'alphabetical' | keyof AppQueue['counts'];
export type SortDirection = 'asc' | 'desc';

export function useSortQueues(queues: AppQueue[]) {
  const {
    sorting: {
      dashboard: { key: sortKey, direction: sortDirection },
    },
    setSettings,
  } = useSettingsStore(({ setSettings, sorting }) => ({ sorting, setSettings }));

  const sortedQueues = queues.slice(0).sort((a, z) => {
    if (sortKey === 'alphabetical') {
      return sortDirection === 'asc'
        ? a.displayName!.localeCompare(z.displayName!)
        : z.displayName!.localeCompare(a.displayName!);
    }
    return sortDirection === 'asc'
      ? a.counts[sortKey] - z.counts[sortKey]
      : z.counts[sortKey] - a.counts[sortKey];
  });

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

  return { sortedQueues, sortDirection, sortKey, onSort };
}
