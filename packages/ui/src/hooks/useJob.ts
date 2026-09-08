import type { AppJob, JobState as ApiJobState } from '@bull-board/api/typings/app';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { JobActions, Status } from '../../typings/app';
import { getConfirmFor } from '../utils/getConfirmFor';
import { queryKeys } from './queryKeys';
import { useActiveJobId } from './useActiveJobId';
import { useActiveQueueName } from './useActiveQueueName';
import { useApi } from './useApi';
import { useConfirm } from './useConfirm';
import { useQueues } from './useQueues';
import { useSettingsStore } from './useSettings';

function toTabStatus(state: ApiJobState | undefined): Status {
  return !state || state === 'stuck' || state === 'unknown' ? 'latest' : state;
}

export type JobState = {
  job: AppJob | null;
  status: Status;
  loading: boolean;
  /** Showing the previously viewed job while the next fetch resolves. */
  isTransitioning: boolean;
};

export function useJob(): JobState & { actions: JobActions } {
  const api = useApi();
  const queryClient = useQueryClient();
  const activeQueueName = useActiveQueueName();
  const activeJobId = useActiveJobId();
  const {
    actions: { updateQueues },
  } = useQueues();

  const { t } = useTranslation();

  const { confirmJobActions, pollingInterval } = useSettingsStore(
    useShallow(({ confirmJobActions, pollingInterval }) => ({
      confirmJobActions,
      pollingInterval,
    }))
  );

  const { openConfirm } = useConfirm();

  const queryKey = queryKeys.job(activeQueueName, activeJobId);

  const { data, isPending, isPlaceholderData } = useQuery({
    queryKey,
    queryFn: () => api.getJob(activeQueueName, activeJobId),
    enabled: !!activeJobId,
    refetchInterval: pollingInterval > 0 ? pollingInterval * 1000 : false,
    placeholderData: keepPreviousData,
  });

  const getJob = () => queryClient.invalidateQueries({ queryKey });

  const withConfirmAndUpdate = getConfirmFor(activeJobId ? getJob : updateQueues, openConfirm);

  const promoteJob = (queueName: string) => (job: AppJob) =>
    withConfirmAndUpdate(() => api.promoteJob(queueName, job.id), {
      description: t('JOB.ACTIONS.CONFIRM.PROMOTE'),
      shouldConfirm: confirmJobActions,
    });

  const retryJob = (queueName: string) => (job: AppJob) =>
    withConfirmAndUpdate(() => api.retryJob(queueName, job.id), {
      description: t('JOB.ACTIONS.CONFIRM.RETRY'),
      shouldConfirm: confirmJobActions,
    });

  /**
   * Cleaning the run a job scheduler is currently waiting on would leave the scheduler registered
   * but unable to fire again, so the API refuses it and names the scheduler. Removing the whole
   * schedule is destructive and not what the trash icon implies, so it always asks first, however
   * the "confirm job actions" setting is set.
   */
  const cleanJob = (queueName: string) => (job: AppJob) =>
    withConfirmAndUpdate(
      async () => {
        const response = await api.cleanJob(queueName, job.id);

        if (response?.code !== 'JOB_BELONGS_TO_JOB_SCHEDULER') {
          return;
        }

        await openConfirm({
          title: t('JOB.ACTIONS.CONFIRM.REMOVE_JOB_SCHEDULER_TITLE'),
          description: t('JOB.ACTIONS.CONFIRM.REMOVE_JOB_SCHEDULER', {
            schedulerId: response.jobSchedulerId,
          }),
        });

        await api.removeJobScheduler(queueName, response.jobSchedulerId);
      },
      { description: t('JOB.ACTIONS.CONFIRM.CLEAN'), shouldConfirm: confirmJobActions }
    );

  const updateJobData = (queueName: string, job: AppJob, newData: Record<string, any>) =>
    withConfirmAndUpdate(() => api.updateJobData(queueName, job.id, newData), {
      description: '',
      shouldConfirm: false,
    });

  const changeJobDelay = (queueName: string, job: AppJob, runAt: number) =>
    withConfirmAndUpdate(() => api.changeJobDelay(queueName, `${job.id}`, runAt), {
      description: '',
      shouldConfirm: false,
    });

  const changeJobPriority = (queueName: string, job: AppJob, priority: number) =>
    withConfirmAndUpdate(() => api.changeJobPriority(queueName, `${job.id}`, priority), {
      description: '',
      shouldConfirm: false,
    });

  const removeUnprocessedChildren = (queueName: string) => (job: AppJob) =>
    withConfirmAndUpdate(() => api.removeUnprocessedChildren(queueName, `${job.id}`), {
      description: t('JOB.ACTIONS.CONFIRM.REMOVE_UNPROCESSED_CHILDREN'),
      shouldConfirm: confirmJobActions,
    });

  const getJobLogs = (queueName: string) => (job: AppJob) => () =>
    api.getJobLogs(queueName, job.id);

  return {
    job: data?.job ?? null,
    status: toTabStatus(data?.status),
    loading: isPending,
    isTransitioning: isPlaceholderData,
    actions: {
      getJob,
      promoteJob,
      cleanJob,
      getJobLogs,
      retryJob,
      updateJobData,
      changeJobDelay,
      changeJobPriority,
      removeUnprocessedChildren,
    },
  };
}
