import type {
  MetricsLatencyGranularity,
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
  granularity: MetricsLatencyGranularity;
  percentiles: number[];
  /** Set false to skip the request entirely, e.g. when the board has no latency provider. */
  enabled?: boolean;
}

export function useLatencyMetrics(params: UseLatencyMetricsParams) {
  const api = useApi();
  const pollingInterval = useSettingsStore(({ pollingInterval }) => pollingInterval);
  const { enabled = true, ...queryParams } = params;

  const { data, isPending } = useQuery({
    queryKey: queryKeys.latencyMetrics(queryParams),
    queryFn: () => api.getLatencyMetrics(queryParams),
    refetchInterval: pollingInterval > 0 ? pollingInterval * 1000 : false,
    enabled,
  });

  return { points: (data ?? []) as MetricsLatencyPoint[], loading: isPending };
}
