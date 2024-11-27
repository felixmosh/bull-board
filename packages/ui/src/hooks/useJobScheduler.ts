import { RepeatableJob } from '@bull-board/api/typings/app'; // Assuming this type exists
import { create } from 'zustand';
import { JobSchedulerActions } from '../../typings/app'; // Define this type in your typings
import { useApi } from './useApi';
import { useActiveQueueName } from './useActiveQueueName';
import { useActiveJobId } from './useActiveJobId';

type JobSchedulerState = {
  jobScheduler: RepeatableJob | null;
  loading: boolean;
  updateJobScheduler(jobScheduler: RepeatableJob): void;
};

const useQueuesStore = create<JobSchedulerState>((set) => ({
  jobScheduler: null,
  loading: true,
  updateJobScheduler: (jobScheduler: RepeatableJob) =>
    set(() => ({ jobScheduler, loading: false })),
}));

export function useJobScheduler(): Omit<JobSchedulerState, 'updateJobScheduler'> & {
  actions: JobSchedulerActions;
} {
  const api = useApi();
  const activeQueueName = useActiveQueueName();
  const activeJobSchedulerId = useActiveJobId();
  //   const {
  //     actions: { updateQueues },
  //   } = useQueues();

  //   const { t } = useTranslation();

  //   const { confirmJobSchedulerActions, pollingInterval } = useSettingsStore(
  //     ({ confirmJobSchedulerActions, pollingInterval }) => ({
  //       confirmJobSchedulerActions,
  //       pollingInterval,
  //     })
  //   );

  const { jobScheduler, loading, updateJobScheduler: setState } = useQueuesStore((state) => state);

  const getJobScheduler = () =>
    api
      .getJobScheduler(activeQueueName, activeJobSchedulerId)
      .then(({ jobScheduler }) => setState(jobScheduler));

  const pollJobScheduler = () => {};
  const updateJobScheduler = () => {};
  const removeJobScheduler = () => {};

  return {
    jobScheduler,
    loading,
    actions: { getJobScheduler, pollJobScheduler, updateJobScheduler, removeJobScheduler },
  };
}
