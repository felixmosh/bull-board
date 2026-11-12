import type { QueueWorker } from '@bull-board/api/typings/app';
import { useQuery } from '@tanstack/react-query';
import type { Api } from '../services/Api';
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
 * The worker list for one queue, fetched once when the panel that shows it opens.
 * Whether a queue has workers at all comes from `useQueueHasWorkers`, so nothing here
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

const HAS_WORKERS_TTL = 60_000;
const HAS_WORKERS_BATCH_WINDOW = 50;

type HasWorkersBatch = {
  queueNames: Set<string>;
  result: Promise<Record<string, boolean | null>>;
};

const openBatches = new WeakMap<Api, HasWorkersBatch>();

function loadHasWorkers(api: Api, queueName: string): Promise<boolean | null> {
  let batch = openBatches.get(api);
  if (!batch) {
    const queueNames = new Set<string>();
    const result = new Promise((resolve) => setTimeout(resolve, HAS_WORKERS_BATCH_WINDOW))
      .then(() => {
        openBatches.delete(api);
        return api.getQueuesHasWorkers([...queueNames]);
      })
      .then((res) => res.hasWorkers);
    batch = { queueNames, result };
    openBatches.set(api, batch);
  }

  batch.queueNames.add(queueName);
  return batch.result.then((hasWorkers) => hasWorkers[queueName] ?? null);
}

export function useQueueHasWorkers(queueName: string, enabled = true): boolean | null {
  const api = useApi();
  const { showWorkers = true } = useUIConfig();
  const pollingInterval = useSettingsStore((state) => state.pollingInterval);

  const { data } = useQuery({
    queryKey: queryKeys.queueHasWorkers(queueName),
    queryFn: () => loadHasWorkers(api, queueName),
    enabled: showWorkers && enabled,
    staleTime: HAS_WORKERS_TTL,
    refetchInterval: pollingInterval > 0 ? HAS_WORKERS_TTL : false,
  });

  return data ?? null;
}
