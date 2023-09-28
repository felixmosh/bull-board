import { STATUSES } from '@bull-board/api/dist/src/constants/statuses';
import { JobCleanStatus, JobRetryStatus } from '@bull-board/api/dist/typings/app';
import { GetQueuesResponse } from '@bull-board/api/dist/typings/responses';
import { useCallback } from 'react';
import { create } from 'zustand';
import { QueueActions } from '../../typings/app';
import { getConfirmFor } from '../utils/getConfirmFor';
import { useActiveQueueName } from './useActiveQueueName';
import { useApi } from './useApi';
import { useConfirm } from './useConfirm';
import { useInterval } from './useInterval';
import { useQuery } from './useQuery';
import { useSelectedStatuses } from './useSelectedStatuses';
import { useSettingsStore } from './useSettings';
import { useSearchPromptStore } from './useSearchPrompt';

export type QueuesState = {
  queues: null | GetQueuesResponse['queues'];
  loading: boolean;
  updateQueues(queues: GetQueuesResponse['queues']): void;
};

const useQueuesStore = create<QueuesState>((set) => ({
  queues: [],
  loading: true,
  updateQueues: (queues: GetQueuesResponse['queues']) => set(() => ({ queues, loading: false })),
}));

export function useQueues(): Omit<QueuesState, 'updateQueues'> & { actions: QueueActions } {
  const query = useQuery();
  const api = useApi();
  const activeQueueName = useActiveQueueName();
  const selectedStatuses = useSelectedStatuses();
  const { pollingInterval, jobsPerPage, confirmQueueActions } = useSettingsStore(
    ({ pollingInterval, jobsPerPage, confirmQueueActions }) => ({
      pollingInterval,
      jobsPerPage,
      confirmQueueActions,
    })
  );

  const { queues, loading, updateQueues: setState } = useQueuesStore((state) => state);
  const { openConfirm } = useConfirm();
  const searchPrompt = useSearchPromptStore()['searchPrompt']

  const updateQueues = useCallback(
    () =>
      api
        .getQueues({
          activeQueue: activeQueueName || undefined,
          status: activeQueueName ? selectedStatuses[activeQueueName] : undefined,
          page: query.get('page') || '1',
          jobsPerPage,
          searchPrompt,
        })
        .then((data) => {
          setState(data.queues);
        })
        // eslint-disable-next-line no-console
        .catch((error) => console.error('Failed to poll', error)),
    [activeQueueName, jobsPerPage, selectedStatuses, searchPrompt]
  );

  const pollQueues = () =>
    useInterval(updateQueues, pollingInterval > 0 ? pollingInterval * 1000 : null, [
      selectedStatuses,
      searchPrompt,
    ]);

  const withConfirmAndUpdate = getConfirmFor(updateQueues, openConfirm);

  const retryAll = (queueName: string, status: JobRetryStatus) =>
    withConfirmAndUpdate(
      () => api.retryAll(queueName, status),
      `Are you sure that you want to retry all ${status} jobs?`,
      confirmQueueActions
    );

  const promoteAll = (queueName: string) =>
    withConfirmAndUpdate(
      () => api.promoteAll(queueName),
      `Are you sure that you want to promote all ${STATUSES.delayed} jobs?`,
      confirmQueueActions
    );

  const cleanAll = (queueName: string, status: JobCleanStatus) =>
    withConfirmAndUpdate(
      () => api.cleanAll(queueName, status),
      `Are you sure that you want to clean all ${status} jobs?`,
      confirmQueueActions
    );

  const pauseQueue = (queueName: string) =>
    withConfirmAndUpdate(
      () => api.pauseQueue(queueName),
      'Are you sure that you want to pause queue processing?',
      confirmQueueActions
    );

  const resumeQueue = (queueName: string) =>
    withConfirmAndUpdate(
      () => api.resumeQueue(queueName),
      'Are you sure that you want to resume queue processing?',
      confirmQueueActions
    );

  const emptyQueue = (queueName: string) =>
    withConfirmAndUpdate(
      () => api.emptyQueue(queueName),
      'Are you sure that you want to empty the queue?',
      confirmQueueActions
    );

  return {
    queues,
    loading,
    actions: {
      updateQueues,
      pollQueues,
      retryAll,
      promoteAll,
      cleanAll,
      pauseQueue,
      resumeQueue,
      emptyQueue,
    },
  };
}
