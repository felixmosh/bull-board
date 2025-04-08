import { JobCleanStatus, JobRetryStatus, QueueSortKey } from '@bull-board/api/typings/app';
import { GetQueuesResponse } from '@bull-board/api/typings/responses';
import { useCallback, useState } from 'react';
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
  sortedQueues: null | GetQueuesResponse['queues'];
  loading: boolean;
  updateQueues(queues: GetQueuesResponse['queues'], sortedQueues?: GetQueuesResponse['queues']): void;
};

const useQueuesStore = create<QueuesState>((set) => ({
  queues: [],
  sortedQueues: [],
  loading: true,
  updateQueues: (queues: GetQueuesResponse['queues'], sortedQueues?: GetQueuesResponse['queues']) => 
    set(() => ({ 
      queues, 
      sortedQueues: sortedQueues || queues,
      loading: false 
    })),
}));

export function useQueues(): Omit<QueuesState, 'updateQueues'> & { actions: QueueActions } {
  const [activeQueueSortKey, setActiveQueueSortKey] = useState<QueueSortKey>('alphabetical');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
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

  const { queues, sortedQueues, loading, updateQueues: setState } = useQueuesStore((state) => state);
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
          const sortedQueues = data.queues ? [...data.queues].sort((a, b) => {
            if (activeQueueSortKey === 'alphabetical') {
              return sortDirection === 'asc'
                ? a.name.localeCompare(b.name)
                : b.name.localeCompare(a.name);
            }

            return sortDirection === 'asc'
              ? a.counts[activeQueueSortKey] - b.counts[activeQueueSortKey]
              : b.counts[activeQueueSortKey] - a.counts[activeQueueSortKey];
          }).map(queue => ({
            ...queue,
            displayName: queue.displayName || queue.name
          })) : [];
          
          setState(sortedQueues);
        })
        .catch((error) => console.error('Failed to poll', error)),
    [activeQueueName, jobsPerPage, selectedStatuses, activeQueueSortKey, sortDirection]
  );

  const pollQueues = () =>
    useInterval(updateQueues, pollingInterval > 0 ? pollingInterval * 1000 : null, [
      selectedStatuses, activeQueueSortKey, sortDirection
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

  const sortQueues = useCallback((sortKey: QueueSortKey) => {
    const newDirection = sortKey === activeQueueSortKey 
      ? (sortDirection === 'asc' ? 'desc' : 'asc')
      : 'asc';

    if (sortKey !== activeQueueSortKey) {
      setActiveQueueSortKey(sortKey);
    }
    setSortDirection(newDirection);

    const newSortedQueues = queues ? [...queues].sort((a, b) => {
      if (sortKey === 'alphabetical') {
        return newDirection === 'asc' 
          ? a.name.localeCompare(b.name)
          : b.name.localeCompare(a.name);
      }

      return newDirection === 'asc'
        ? a.counts[sortKey] - b.counts[sortKey]
        : b.counts[sortKey] - a.counts[sortKey];
    }) : [];

    setState(queues || [], newSortedQueues);
  }, [queues, activeQueueSortKey, sortDirection]);
  
  const pauseAll = withConfirmAndUpdate(
    () => api.pauseAllQueues(),
    t('QUEUE.ACTIONS.CONFIRM.PAUSE_ALL'),
    confirmQueueActions
  );

  const resumeAll = withConfirmAndUpdate(
    () => api.resumeAllQueues(),
    t('QUEUE.ACTIONS.CONFIRM.RESUME_ALL'),
    confirmQueueActions
  );

  return {
    queues,
    sortedQueues,
    loading,
    actions: {
      pauseAll,
      resumeAll,
      updateQueues,
      pollQueues,
      retryAll,
      promoteAll,
      cleanAll,
      pauseQueue,
      resumeQueue,
      emptyQueue,
      addJob,
      sortQueues,
    },
  };
}
