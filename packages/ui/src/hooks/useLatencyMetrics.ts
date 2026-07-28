import type {
  MetricsHistoryGranularity,
  MetricsLatencyMetric,
  MetricsLatencyPoint,
} from '@bull-board/api/typings/app';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { useApi } from './useApi';
import { useSettingsStore } from './useSettings';

export interface UseLatencyMetricsParams {
  queue?: string;
  metric: MetricsLatencyMetric;
  from: number;
  to: number;
  granularity: MetricsHistoryGranularity;
  percentiles: number[];
}

export function useLatencyMetrics(params: UseLatencyMetricsParams) {
  const api = useApi();
  const pollingInterval = useSettingsStore(({ pollingInterval }) => pollingInterval);

  const { data, isPending } = useQuery({
    queryKey: queryKeys.latencyMetrics(params),
    queryFn: () => api.getLatencyMetrics(params),
    refetchInterval: pollingInterval > 0 ? pollingInterval * 1000 : false,
  });

  return { points: (data ?? []) as MetricsLatencyPoint[], loading: isPending };
}
