import type {
  MetricsHistoryGranularity,
  MetricsHistoryPoint,
  MetricsType,
} from '@bull-board/api/typings/app';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { useApi } from './useApi';
import { useSettingsStore } from './useSettings';

export interface UseHistoryMetricsParams {
  queue?: string;
  metric: MetricsType;
  from: number;
  to: number;
  granularity: MetricsHistoryGranularity;
}

export function useHistoryMetrics(params: UseHistoryMetricsParams, enabled: boolean) {
  const api = useApi();
  const pollingInterval = useSettingsStore(({ pollingInterval }) => pollingInterval);

  const { data, isPending } = useQuery({
    queryKey: queryKeys.historyMetrics(params),
    queryFn: () => api.getHistoryMetrics(params),
    enabled,
    refetchInterval: pollingInterval > 0 ? pollingInterval * 1000 : false,
  });

  const points: MetricsHistoryPoint[] = data?.points ?? [];
  return { points, loading: isPending };
}
