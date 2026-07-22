import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { useApi } from './useApi';

export function useQueueDefaultJobOptions(queueName: string | null, enabled: boolean) {
  const api = useApi();

  const { data, isPending } = useQuery({
    queryKey: queryKeys.defaultJobOptions(queueName),
    queryFn: () => api.getQueueDefaultJobOptions(queueName as string),
    enabled: enabled && !!queueName,
    // Fixed at queue construction, it can't change while the dashboard is open.
    staleTime: Infinity,
  });

  return { defaultJobOptions: data ?? null, loading: isPending };
}
