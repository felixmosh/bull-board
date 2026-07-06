import type { AppJob } from '@bull-board/api/typings/app';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { JobActions, Status } from '../../typings/app';
import { getConfirmFor } from '../utils/getConfirmFor';
import { queryKeys } from './queryKeys';
import { useActiveJobId } from './useActiveJobId';
import { useActiveQueueName } from './useActiveQueueName';
import { useApi } from './useApi';
import { useConfirm } from './useConfirm';
import { useQueues } from './useQueues';
import { useSettingsStore } from './useSettings';

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
    ({ confirmJobActions, pollingInterval }) => ({
      confirmJobActions,
      pollingInterval,
    })
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
    withConfirmAndUpdate(
      () => api.promoteJob(queueName, job.id),
      t('JOB.ACTIONS.CONFIRM.PROMOTE'),
      confirmJobActions
    );

  const retryJob = (queueName: string) => (job: AppJob) =>
    withConfirmAndUpdate(
      () => api.retryJob(queueName, job.id),
      t('JOB.ACTIONS.CONFIRM.RETRY'),
      confirmJobActions
    );

  const cleanJob = (queueName: string) => (job: AppJob) =>
    withConfirmAndUpdate(
      () => api.cleanJob(queueName, job.id),
      t('JOB.ACTIONS.CONFIRM.CLEAN'),
      confirmJobActions
    );

  const updateJobData = (queueName: string, job: AppJob, newData: Record<string, any>) =>
    withConfirmAndUpdate(() => api.updateJobData(queueName, job.id, newData), '', false);

  const getJobLogs = (queueName: string) => (job: AppJob) => () =>
    api.getJobLogs(queueName, job.id);

  return {
    job: data?.job ?? null,
    status: data?.status ?? 'latest',
    loading: isPending,
    isTransitioning: isPlaceholderData,
    actions: {
      getJob,
      promoteJob,
      cleanJob,
      getJobLogs,
      retryJob,
      updateJobData,
    },
  };
}
