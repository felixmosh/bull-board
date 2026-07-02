import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { useApi } from './useApi';
import { useSettingsStore } from './useSettings';

export function useMetrics(queueName: string | null) {
  const api = useApi();
  const pollingInterval = useSettingsStore(({ pollingInterval }) => pollingInterval);

  const { data, isPending } = useQuery({
    queryKey: queryKeys.metrics(queueName),
    queryFn: () => api.getMetrics(queueName as string),
    enabled: !!queueName,
    refetchInterval: pollingInterval > 0 ? pollingInterval * 1000 : false,
  });

  return { metrics: data ?? null, loading: isPending };
}
