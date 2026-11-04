import type { AppJob } from '@bull-board/api/typings/app';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { useApi } from './useApi';

/**
 * The queue's most recent completed job, read through the regular queue listing (completed,
 * newest first, one per page). The filter builder offers its fields as ready made conditions.
 */
export function useLastCompletedJob(queueName: string, enabled: boolean) {
  const api = useApi();

  const { data, isPending, isFetching, refetch } = useQuery({
    queryKey: queryKeys.lastCompletedJob(queueName),
    queryFn: async (): Promise<AppJob | null> => {
      const response = await api.getQueues({
        activeQueue: queueName,
        status: 'completed',
        page: '1',
        jobsPerPage: 1,
      });
      return response.queues.find((queue) => queue.name === queueName)?.jobs[0] ?? null;
    },
    enabled,
    staleTime: 60_000,
  });

  return { job: data ?? null, loading: enabled && isPending, refreshing: isFetching, refetch };
}
