import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { useApi } from './useApi';

export function useQueueJobDataSchema(queueName: string | null, enabled: boolean) {
  const api = useApi();

  const { data, isPending } = useQuery({
    queryKey: queryKeys.jobDataSchema(queueName),
    queryFn: () => api.getQueueJobDataSchema(queueName as string),
    enabled: enabled && !!queueName,
    // Author-supplied config, it can't change while the dashboard is open.
    staleTime: Infinity,
  });

  return { jobDataSchema: data ?? null, loading: isPending };
}
