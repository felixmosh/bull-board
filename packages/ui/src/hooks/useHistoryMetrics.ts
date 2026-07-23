import type { MetricsHistoryGranularity, MetricsHistoryPoint } from '@bull-board/api/typings/app';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { useApi } from './useApi';
import { useSettingsStore } from './useSettings';

export interface UseHistoryMetricsParams {
  queue?: string;
  from: number;
  to: number;
  granularity: MetricsHistoryGranularity;
}

export function useHistoryMetrics(params: UseHistoryMetricsParams) {
  const api = useApi();
  const pollingInterval = useSettingsStore(({ pollingInterval }) => pollingInterval);

  const { data, isPending } = useQuery({
    queryKey: queryKeys.historyMetrics(params),
    queryFn: () => api.getHistoryMetrics(params),
    refetchInterval: pollingInterval > 0 ? pollingInterval * 1000 : false,
  });

  return {
    completed: (data?.completed ?? []) as MetricsHistoryPoint[],
    failed: (data?.failed ?? []) as MetricsHistoryPoint[],
    loading: isPending,
  };
}
