import type { AppQueue } from '@bull-board/api/typings/app';
import { useCallback, useState } from 'react';

export type QueueSortKey = 'alphabetical' | keyof AppQueue['counts'];
export type SortDirection = 'asc' | 'desc';

export function useSortQueues(queues: AppQueue[]) {
  const [sortKey, setSortKey] = useState<QueueSortKey>('alphabetical');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

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
      if (newSortKey === sortKey) {
        setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(newSortKey);
        setSortDirection('asc');
      }
    },
    [sortKey, sortDirection]
  );

  return { sortedQueues, sortDirection, sortKey, onSort };
}
