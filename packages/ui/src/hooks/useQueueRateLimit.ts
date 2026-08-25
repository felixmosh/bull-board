import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { useApi } from './useApi';

export function useQueueRateLimit(queueName: string | null, enabled: boolean) {
  const api = useApi();

  const { data, isPending } = useQuery({
    queryKey: queryKeys.queueRateLimit(queueName),
    queryFn: () => api.getQueueRateLimit(queueName as string),
    enabled: enabled && !!queueName,
  });

  return {
    rateLimit: data?.rateLimit ?? null,
    supported: data?.supported ?? false,
    loading: isPending,
  };
}
