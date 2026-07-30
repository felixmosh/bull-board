import type { QueueWorker } from '@bull-board/api/typings/app';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { useApi } from './useApi';
import { useUIConfig } from './useUIConfig';

export type QueueWorkersState = {
  /** `null` while unknown, or when the queue cannot report its workers at all. */
  workers: QueueWorker[] | null;
  loading: boolean;
};

/**
 * The worker list for one queue, fetched once when the panel that shows it opens.
 * Whether a queue has workers at all rides along with the queue listing, so nothing here
 * needs to keep polling.
 */
export function useQueueWorkers(
  queueName: string | null | undefined,
  enabled = true
): QueueWorkersState {
  const api = useApi();
  // Opting out has to stop the request, not just hide the list: the cost is the
  // `CLIENT LIST` the server runs, not the rendering.
  const { showWorkers = true } = useUIConfig();

  const { data, isPending } = useQuery({
    queryKey: queryKeys.queueWorkers(queueName ?? null),
    queryFn: () => api.getQueueWorkers(queueName as string),
    enabled: showWorkers && enabled && !!queueName,
    select: (res) => res.workers,
  });

  return {
    workers: data ?? null,
    loading: isPending,
  };
}
