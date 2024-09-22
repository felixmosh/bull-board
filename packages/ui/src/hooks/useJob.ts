import { AppJob, JobRetryStatus } from '@bull-board/api/typings/app';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';
import { JobActions, Status } from '../../typings/app';
import { getConfirmFor } from '../utils/getConfirmFor';
import { useActiveJobId } from './useActiveJobId';
import { useActiveQueueName } from './useActiveQueueName';
import { useApi } from './useApi';
import { useConfirm } from './useConfirm';
import { useInterval } from './useInterval';
import { useQueues } from './useQueues';
import { useSettingsStore } from './useSettings';

export type JobState = {
  job: AppJob | null;
  status: Status;
  loading: boolean;
  updateJob(job: AppJob, status: Status): void;
};

const useQueuesStore = create<JobState>((set) => ({
  job: null,
  status: 'latest',
  loading: true,
  updateJob: (job: AppJob, status: Status) => set(() => ({ job, status, loading: false })),
}));

export function useJob(): Omit<JobState, 'updateJob'> & { actions: JobActions } {
  const api = useApi();
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

  const { job, status, loading, updateJob: setState } = useQueuesStore((state) => state);
  const { openConfirm } = useConfirm();

  const getJob = () =>
    api.getJob(activeQueueName, activeJobId).then(({ job, status }) => setState(job, status));

  const pollJob = () =>
    useInterval(getJob, pollingInterval > 0 ? pollingInterval * 1000 : null, [activeQueueName]);

  const withConfirmAndUpdate = getConfirmFor(activeJobId ? getJob : updateQueues, openConfirm);

  const promoteJob = (queueName: string) => (job: AppJob) =>
    withConfirmAndUpdate(
      () => api.promoteJob(queueName, job.id),
      t('JOB.ACTIONS.CONFIRM.PROMOTE'),
      confirmJobActions
    );

  const retryJob = (queueName: string, status: JobRetryStatus) => (job: AppJob) =>
    withConfirmAndUpdate(
      () => api.retryJob(queueName, job.id, status),
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
    job,
    status,
    loading,
    actions: {
      getJob,
      pollJob,
      promoteJob,
      cleanJob,
      getJobLogs,
      retryJob,
      updateJobData,
    },
  };
}
