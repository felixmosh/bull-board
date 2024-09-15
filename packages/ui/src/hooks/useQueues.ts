import { JobCleanStatus, JobRetryStatus } from '@bull-board/api/typings/app';
import { GetQueuesResponse } from '@bull-board/api/typings/responses';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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

  const updateQueues = useCallback(
    () =>
      api
        .getQueues({
          activeQueue: activeQueueName || undefined,
          status: activeQueueName ? selectedStatuses[activeQueueName] : undefined,
          page: query.get('page') || '1',
          jobsPerPage,
        })
        .then((data) => {
          setState(data.queues);
        })
        // eslint-disable-next-line no-console
        .catch((error) => console.error('Failed to poll', error)),
    [activeQueueName, jobsPerPage, selectedStatuses]
  );

  const pollQueues = () =>
    useInterval(updateQueues, pollingInterval > 0 ? pollingInterval * 1000 : null, [
      selectedStatuses,
    ]);

  const withConfirmAndUpdate = getConfirmFor(updateQueues, openConfirm);

  const retryAll = (queueName: string, status: JobRetryStatus) =>
    withConfirmAndUpdate(
      () => api.retryAll(queueName, status),
      t('QUEUE.ACTIONS.CONFIRM.RETRY_ALL', { status }),
      confirmQueueActions
    );

  const promoteAll = (queueName: string) =>
    withConfirmAndUpdate(
      () => api.promoteAll(queueName),
      t('QUEUE.ACTIONS.CONFIRM.PROMOTE_ALL'),
      confirmQueueActions
    );

  const cleanAll = (queueName: string, status: JobCleanStatus) =>
    withConfirmAndUpdate(
      () => api.cleanAll(queueName, status),
      t('QUEUE.ACTIONS.CONFIRM.CLEAN_ALL', { status }),
      confirmQueueActions
    );

  const pauseQueue = (queueName: string) =>
    withConfirmAndUpdate(
      () => api.pauseQueue(queueName),
      t('QUEUE.ACTIONS.CONFIRM.PAUSE_QUEUE'),
      confirmQueueActions
    );

  const resumeQueue = (queueName: string) =>
    withConfirmAndUpdate(
      () => api.resumeQueue(queueName),
      t('QUEUE.ACTIONS.CONFIRM.RESUME_QUEUE'),
      confirmQueueActions
    );

  const emptyQueue = (queueName: string) =>
    withConfirmAndUpdate(
      () => api.emptyQueue(queueName),
      t('QUEUE.ACTIONS.CONFIRM.EMPTY_QUEUE'),
      confirmQueueActions
    );

  const addJob = (
    queueName: string,
    jobName: string,
    jobData: Record<any, any>,
    jobOptions: Record<any, any>
  ) => withConfirmAndUpdate(() => api.addJob(queueName, jobName, jobData, jobOptions), '', false);

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
      addJob,
    },
  };
}
