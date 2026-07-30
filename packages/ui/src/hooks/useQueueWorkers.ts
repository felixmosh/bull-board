import type { QueueWorker } from '@bull-board/api/typings/app';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { useApi } from './useApi';
import { useSettingsStore } from './useSettings';
import { useUIConfig } from './useUIConfig';

export type QueueWorkersState = {
  /** `null` while unknown, or when the queue cannot report its workers at all. */
  workers: QueueWorker[] | null;
  loading: boolean;
};

/**
 * Connected workers for every visible queue, refreshed on the board polling interval.
 * One request covers the whole board, so cards and the queue page share a single fetch.
 */
export function useQueueWorkers(queueName: string | null | undefined): QueueWorkersState {
  const api = useApi();
  const pollingInterval = useSettingsStore(({ pollingInterval }) => pollingInterval);
  // Opting out has to stop the request, not just hide the badge: the cost is the
  // `CLIENT LIST` the server runs per queue, not the rendering.
  const { showWorkers = true } = useUIConfig();

  const { data, isPending } = useQuery({
    queryKey: queryKeys.queueWorkers,
    queryFn: () => api.getQueueWorkers(),
    enabled: showWorkers,
    refetchInterval: pollingInterval > 0 ? pollingInterval * 1000 : false,
    select: (res) => res.workers,
  });

  return {
    workers: (queueName && data?.[queueName]) || null,
    loading: isPending,
  };
}
