import type {
  MetricsHistoryGranularity,
  MetricsHistoryMetric,
  MetricsHistoryPoint,
} from '@bull-board/api/typings/app';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { useApi } from './useApi';
import { useSettingsStore } from './useSettings';

export interface UseHistoryMetricsParams {
  queue?: string;
  /** Restricts the response to a single metric (e.g. 'queueage'). Omit to get completed + failed. */
  metric?: MetricsHistoryMetric;
  from: number;
  to: number;
  granularity: MetricsHistoryGranularity;
  /** Set false to skip the request entirely, e.g. a chart variant that never needs this series. */
  enabled?: boolean;
}

export function useHistoryMetrics(params: UseHistoryMetricsParams) {
  const api = useApi();
  const pollingInterval = useSettingsStore(({ pollingInterval }) => pollingInterval);
  const { enabled = true, ...queryParams } = params;

  const { data, isPending } = useQuery({
    queryKey: queryKeys.historyMetrics(queryParams),
    queryFn: () => api.getHistoryMetrics(queryParams),
    refetchInterval: pollingInterval > 0 ? pollingInterval * 1000 : false,
    enabled,
  });

  return {
    completed: (data?.completed ?? []) as MetricsHistoryPoint[],
    failed: (data?.failed ?? []) as MetricsHistoryPoint[],
    /** Populated only when `metric` is passed, e.g. the queue-age scalar series. */
    points:
      (queryParams.metric ? data?.[queryParams.metric] : undefined) ??
      ([] as MetricsHistoryPoint[]),
    loading: isPending,
  };
}
