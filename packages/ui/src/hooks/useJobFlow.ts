import type { JobFlow } from '@bull-board/api/typings/app';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { useActiveJobId } from './useActiveJobId';
import { useActiveQueueName } from './useActiveQueueName';
import { useApi } from './useApi';
import { useSettingsStore } from './useSettings';

export type JobFlowState = {
  flow: JobFlow | null;
  loading: boolean;
  error: string | null;
};

export function useJobFlow(): JobFlowState {
  const api = useApi();
  const activeQueueName = useActiveQueueName();
  const activeJobId = useActiveJobId();

  const { pollingInterval } = useSettingsStore(({ pollingInterval }) => ({
    pollingInterval,
  }));

  const { data, isPending, error } = useQuery({
    queryKey: queryKeys.jobFlow(activeQueueName, activeJobId),
    queryFn: () => api.getJobFlow(activeQueueName, activeJobId),
    enabled: !!activeJobId,
    refetchInterval: pollingInterval > 0 ? pollingInterval * 1000 : false,
  });

  return {
    flow: data ?? null,
    loading: isPending,
    error: error ? (error as Error).message : null,
  };
}
