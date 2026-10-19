import type { AppJobScheduler } from '@bull-board/api/typings/app';
import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSettingsStore } from './useSettings';
import type { SortDirection } from './useSortQueues';

export type SchedulerSortKey = 'id' | 'queueName' | 'next' | 'lastRun' | 'iterationCount';

/**
 * A scheduler that has not run yet, or whose last run was trimmed away, has no value to compare.
 * Those rows stay at the bottom in both directions, so flipping a column never pushes a block of
 * dashes to the top.
 */
export function sortSchedulers(
  schedulers: AppJobScheduler[],
  key: SchedulerSortKey,
  direction: SortDirection,
  queueLabel: (scheduler: AppJobScheduler) => string = (scheduler) => scheduler.queueName
): AppJobScheduler[] {
  // The queue column shows the display name when there is one, so sort by what it shows.
  const valueOf = (scheduler: AppJobScheduler) =>
    key === 'queueName' ? queueLabel(scheduler) : scheduler[key];

  return schedulers.slice(0).sort((a, z) => {
    const left = valueOf(a);
    const right = valueOf(z);

    if (left == null || right == null) {
      return left == null ? (right == null ? 0 : 1) : -1;
    }

    const order =
      typeof left === 'string' && typeof right === 'string'
        ? left.localeCompare(right)
        : Number(left) - Number(right);

    return direction === 'asc' ? order : -order;
  });
}

export function useSortSchedulers(
  schedulers: AppJobScheduler[],
  queueLabel?: (scheduler: AppJobScheduler) => string
) {
  const { sorting, setSettings } = useSettingsStore(
    useShallow(({ setSettings, sorting }) => ({ sorting, setSettings }))
  );
  const { key: sortKey, direction: sortDirection } = sorting.schedulers;

  const sortedSchedulers = sortSchedulers(schedulers, sortKey, sortDirection, queueLabel);

  const onSort = useCallback(
    (newSortKey: SchedulerSortKey) => {
      setSettings({
        sorting: {
          ...sorting,
          schedulers: {
            key: newSortKey,
            direction: newSortKey === sortKey && sortDirection === 'asc' ? 'desc' : 'asc',
          },
        },
      });
    },
    [sorting, sortKey, sortDirection]
  );

  return { sortedSchedulers, sortDirection, sortKey, onSort };
}
