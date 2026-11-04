import { GetQueuesResponse } from '@bull-board/api/typings/responses';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useShallow } from 'zustand/react/shallow';
import { QueueActions } from '../../typings/app';
import { queryKeys } from './queryKeys';
import { useActiveQueueName } from './useActiveQueueName';
import { useApi } from './useApi';
import { readJobFilters } from './useJobFilters';
import { useQueueActions } from './useQueueActions';
import { useSearchParams } from './useSearchParams';
import { useSelectedStatuses } from './useSelectedStatuses';
import { useSettingsStore } from './useSettings';

export type QueuesState = {
  queues: null | GetQueuesResponse['queues'];
  loading: boolean;
  fetching: boolean;
  /** Showing the previous route/filter's data while the next fetch resolves. */
  isTransitioning: boolean;
};

export function useQueues(): QueuesState & { actions: QueueActions } {
  const { page, raw } = useSearchParams();
  const api = useApi();
  const activeQueueName = useActiveQueueName();
  const selectedStatuses = useSelectedStatuses();
  const { pollingInterval, jobsPerPage } = useSettingsStore(
    useShallow(({ pollingInterval, jobsPerPage }) => ({
      pollingInterval,
      jobsPerPage,
    }))
  );

  const status = activeQueueName ? selectedStatuses[activeQueueName] : undefined;
  // Only the open queue's list is filtered; the defaults are left out so they share a cache key.
  const { jobId, order, search } = readJobFilters(raw);
  const filters = activeQueueName
    ? {
        ...(jobId.trim() ? { jobId: jobId.trim() } : {}),
        ...(order !== 'desc' ? { order } : {}),
        ...(search.trim() ? { search: search.trim() } : {}),
      }
    : undefined;
  const params = { activeQueue: activeQueueName || undefined, status, page, jobsPerPage, filters };

  const { data, isPending, isFetching, isPlaceholderData } = useQuery({
    queryKey: queryKeys.queues.list(params),
    queryFn: () => api.getQueues(params),
    refetchInterval: pollingInterval > 0 ? pollingInterval * 1000 : false,
    placeholderData: keepPreviousData,
    // Non-mutating: lets structural sharing keep stable job references across polls.
    select: (res) =>
      res.queues.map((queue) =>
        queue.displayName ? queue : { ...queue, displayName: queue.name }
      ),
  });

  const actions = useQueueActions();

  return {
    queues: data ?? null,
    loading: isPending,
    fetching: isFetching,
    isTransitioning: isPlaceholderData,
    actions,
  };
}
