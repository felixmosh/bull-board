import type { AppJobScheduler } from '@bull-board/api/typings/app';
import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSettingsStore } from './useSettings';
import type { SortDirection } from './useSortQueues';

export type SchedulerSortKey = 'id' | 'queueName' | 'next' | 'lastRun' | 'iterationCount';

export function sortSchedulers(
  schedulers: AppJobScheduler[],
  key: SchedulerSortKey,
  direction: SortDirection,
  queueLabel: (scheduler: AppJobScheduler) => string = (scheduler) => scheduler.queueName
): AppJobScheduler[] {
  const valueOf = (scheduler: AppJobScheduler) =>
    key === 'queueName' ? queueLabel(scheduler) : scheduler[key];

  const compareByKey = (a: AppJobScheduler, z: AppJobScheduler) => {
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
  };

  return schedulers.slice(0).sort((a, z) => compareByKey(a, z) || a.id.localeCompare(z.id));
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
