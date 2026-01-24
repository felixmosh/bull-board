import type { JobFlow } from '@bull-board/api/typings/app';
import { create } from 'zustand';
import { useActiveJobId } from './useActiveJobId';
import { useActiveQueueName } from './useActiveQueueName';
import { useApi } from './useApi';
import { useInterval } from './useInterval';
import { useSettingsStore } from './useSettings';

export type JobFlowState = {
  flow: JobFlow | null;
  loading: boolean;
  error: string | null;
  updateFlow(flow: JobFlow): void;
};

const useJobFlowStore = create<JobFlowState>((set) => ({
  flow: null,
  loading: true,
  error: null,
  updateFlow: (flow: JobFlow) => set(() => ({ flow, loading: false })),
}));

export function useJobFlow(): Omit<JobFlowState, 'updateFlow'> {
  const api = useApi();
  const activeQueueName = useActiveQueueName();
  const activeJobId = useActiveJobId();

  const { pollingInterval } = useSettingsStore(({ pollingInterval }) => ({
    pollingInterval,
  }));

  const { flow, loading, error, updateFlow: setState } = useJobFlowStore((state) => state);

  const getJobFlow = () =>
    api.getJobFlow(activeQueueName, activeJobId).then((flow) => setState(flow));

  useInterval(getJobFlow, pollingInterval > 0 ? pollingInterval * 1000 : null, [
    activeQueueName,
    activeJobId,
  ]);

  return {
    flow,
    loading,
    error,
  };
}
