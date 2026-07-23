import { STATUSES } from '@bull-board/api/constants/statuses';
import type { JobCleanStatus, JobRetryStatus } from '@bull-board/api/typings/app';
import { GetQueuesResponse } from '@bull-board/api/typings/responses';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { QueueActions } from '../../typings/app';
import { runWithToast } from '../utils/actionToast';
import type { RetriableFailedJobs } from '../utils/failedRetries';
import { getConfirmFor } from '../utils/getConfirmFor';
import { queryKeys } from './queryKeys';
import { useActiveQueueName } from './useActiveQueueName';
import { useApi } from './useApi';
import { useConfirm } from './useConfirm';
import { useSearchParams } from './useSearchParams';
import { useSelectedStatuses } from './useSelectedStatuses';
import { useSettingsStore } from './useSettings';

export type QueuesState = {
  queues: null | GetQueuesResponse['queues'];
  loading: boolean;
  fetching: boolean;
  /** Showing the previous route/filter's data while the next fetch resolves. */
  isTransitioning: boolean;
};

export function useQueues(): QueuesState & { actions: QueueActions } {
  const { page } = useSearchParams();
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const activeQueueName = useActiveQueueName();
  const selectedStatuses = useSelectedStatuses();
  const { pollingInterval, jobsPerPage, confirmQueueActions } = useSettingsStore(
    ({ pollingInterval, jobsPerPage, confirmQueueActions }) => ({
      pollingInterval,
      jobsPerPage,
      confirmQueueActions,
    })
  );
  const { openConfirm } = useConfirm();

  const status = activeQueueName ? selectedStatuses[activeQueueName] : undefined;
  const params = { activeQueue: activeQueueName || undefined, status, page, jobsPerPage };

  const { data, isPending, isFetching, isPlaceholderData } = useQuery({
    queryKey: queryKeys.queues.list(params),
    queryFn: () => api.getQueues(params),
    refetchInterval: pollingInterval > 0 ? pollingInterval * 1000 : false,
    placeholderData: keepPreviousData,
    // Non-mutating: lets structural sharing keep stable job references across polls.
    select: (res) =>
      res.queues.map((queue) =>
        queue.displayName ? queue : { ...queue, displayName: queue.name }
      ),
  });

  const invalidateQueues = () => queryClient.invalidateQueries({ queryKey: queryKeys.queues.all });

  const withConfirmAndUpdate = getConfirmFor(invalidateQueues, openConfirm);

  const retryAll = (queueName: string, status: JobRetryStatus) =>
    withConfirmAndUpdate(
      () =>
        runWithToast(() => api.retryAll(queueName, status), {
          pending: t('QUEUE.ACTIONS.TOAST.RETRY_PENDING', { status }),
          success: t('QUEUE.ACTIONS.TOAST.RETRY_DONE', { status }),
        }),
      t('QUEUE.ACTIONS.CONFIRM.RETRY_ALL', { status }),
      confirmQueueActions
    );

  const retryFailedInQueues = ({ queueNames, jobCount }: RetriableFailedJobs) =>
    withConfirmAndUpdate(
      () =>
        runWithToast(
          () => Promise.all(queueNames.map((name) => api.retryAll(name, STATUSES.failed))),
          {
            pending: t('QUEUE.ACTIONS.TOAST.RETRY_QUEUES_PENDING', {
              jobs: jobCount,
              count: queueNames.length,
            }),
            success: t('QUEUE.ACTIONS.TOAST.RETRY_QUEUES_DONE', {
              jobs: jobCount,
              count: queueNames.length,
            }),
          }
        ),
      t('QUEUE.ACTIONS.CONFIRM.RETRY_FAILED_QUEUES', {
        jobs: jobCount,
        count: queueNames.length,
      }),
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

  const obliterateQueue = (queueName: string) =>
    withConfirmAndUpdate(
      () => api.obliterateQueue(queueName),
      t('QUEUE.ACTIONS.CONFIRM.OBLITERATE_QUEUE'),
      true
    );

  const addJob = (
    queueName: string,
    jobName: string,
    jobData: Record<any, any>,
    jobOptions: Record<any, any>
  ) => withConfirmAndUpdate(() => api.addJob(queueName, jobName, jobData, jobOptions), '', false);

  const setGlobalConcurrency = (queueName: string, concurrency: number) =>
    withConfirmAndUpdate(() => api.setGlobalConcurrency(queueName, concurrency), '', false);

  const pauseQueues = (queueNames: string[]) =>
    withConfirmAndUpdate(
      () => Promise.all(queueNames.map((name) => api.pauseQueue(name))),
      t('QUEUE.ACTIONS.CONFIRM.PAUSE_GROUP', { count: queueNames.length }),
      confirmQueueActions
    );

  const resumeQueues = (queueNames: string[]) =>
    withConfirmAndUpdate(
      () => Promise.all(queueNames.map((name) => api.resumeQueue(name))),
      t('QUEUE.ACTIONS.CONFIRM.RESUME_GROUP', { count: queueNames.length }),
      confirmQueueActions
    );

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
    queues: data ?? null,
    loading: isPending,
    fetching: isFetching,
    isTransitioning: isPlaceholderData,
    actions: {
      pauseAll,
      resumeAll,
      updateQueues: invalidateQueues,
      retryAll,
      retryFailedInQueues,
      promoteAll,
      cleanAll,
      pauseQueue,
      resumeQueue,
      pauseQueues,
      resumeQueues,
      emptyQueue,
      obliterateQueue,
      addJob,
      setGlobalConcurrency,
    },
  };
}
