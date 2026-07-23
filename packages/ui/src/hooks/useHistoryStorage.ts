import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { useApi } from './useApi';

export interface PurgeHistoryVariables {
  queue?: string;
  before?: string;
}

/**
 * Storage usage for the recorded metrics history.
 *
 * Deliberately not polled: it reads every history key to sum real memory usage, so it is
 * fetched when the panel is opened and refreshed after a purge, not on the dashboard's
 * regular interval.
 */
export function useHistoryUsage(enabled: boolean) {
  const api = useApi();

  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: queryKeys.historyUsage,
    queryFn: () => api.getHistoryUsage(),
    enabled,
    refetchOnWindowFocus: false,
  });

  return { usage: data, loading: isPending, refreshing: isFetching, error, refetch };
}

export function usePurgeHistory() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: PurgeHistoryVariables) => api.purgeHistory(variables),
    onSuccess: async () => {
      // The charts read the same keys the purge just deleted, so both have to be refetched.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.historyUsage }),
        queryClient.invalidateQueries({ queryKey: ['historyMetrics'] }),
      ]);
    },
  });
}
