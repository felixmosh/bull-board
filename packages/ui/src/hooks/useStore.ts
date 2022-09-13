import { AppJob } from '@bull-board/api/typings/app';
import { GetQueuesResponse } from '@bull-board/api/typings/responses';
import { useState } from 'react';
import { QueueActions, SelectedStatuses } from '../../typings/app';
import { useActiveQueueName } from './useActiveQueueName';
import { useApi } from './useApi';
import { ConfirmApi, useConfirm } from './useConfirm';
import { useInterval } from './useInterval';
import { useQuery } from './useQuery';
import { useSelectedStatuses } from './useSelectedStatuses';
import { useSettingsStore } from './useSettings';

type State = {
  data: null | GetQueuesResponse;
  loading: boolean;
};

export interface Store {
  state: State;
  actions: QueueActions;
  selectedStatuses: SelectedStatuses;
  confirmProps: ConfirmApi['confirmProps'];
}

export const useStore = (): Store => {
  const query = useQuery();
  const api = useApi();
  const { pollingInterval, jobsPerPage, confirmJobActions, confirmQueueActions } = useSettingsStore(
    ({ pollingInterval, jobsPerPage, confirmJobActions, confirmQueueActions }) => ({
      pollingInterval,
      jobsPerPage,
      confirmJobActions,
      confirmQueueActions,
    })
  );

  const [state, setState] = useState<State>({
    data: null,
    loading: true,
  });

  const activeQueueName = useActiveQueueName();
  const { confirmProps, openConfirm } = useConfirm();

  const selectedStatuses = useSelectedStatuses();

  const update = () =>
    api
      .getQueues({
        activeQueue: activeQueueName,
        status: activeQueueName ? selectedStatuses[activeQueueName] : undefined,
        page: query.get('page') || '1',
        jobsPerPage,
      })
      .then((data) => {
        setState({ data, loading: false });
      })
      // eslint-disable-next-line no-console
      .catch((error) => console.error('Failed to poll', error));

  function withConfirmAndUpdate(
    action: () => Promise<any>,
    description: string,
    shouldConfirm: boolean
  ) {
    return async () => {
      try {
        if (shouldConfirm) {
          await openConfirm({ description });
        }
        await action();
        await update();
      } catch (e) {
        if (e) {
          // eslint-disable-next-line no-console
          console.error(e);
        }
      }
    };
  }

  useInterval(update, pollingInterval > 0 ? pollingInterval * 1000 : null, [selectedStatuses]);

  const promoteJob = (queueName: string) => (job: AppJob) =>
    withConfirmAndUpdate(
      () => api.promoteJob(queueName, job.id),
      'Are you sure that you want to promote this job?',
      confirmJobActions
    );

  const retryJob = (queueName: string) => (job: AppJob) =>
    withConfirmAndUpdate(
      () => api.retryJob(queueName, job.id),
      'Are you sure that you want to retry this job?',
      confirmJobActions
    );

  const cleanJob = (queueName: string) => (job: AppJob) =>
    withConfirmAndUpdate(
      () => api.cleanJob(queueName, job.id),
      'Are you sure that you want to clean this job?',
      confirmJobActions
    );

  const retryAll = (queueName: string) =>
    withConfirmAndUpdate(
      () => api.retryAll(queueName),
      'Are you sure that you want to retry all jobs?',
      confirmQueueActions
    );

  const cleanAllDelayed = (queueName: string) =>
    withConfirmAndUpdate(
      () => api.cleanAllDelayed(queueName),
      'Are you sure that you want to clean all delayed jobs?',
      confirmQueueActions
    );

  const cleanAllFailed = (queueName: string) =>
    withConfirmAndUpdate(
      () => api.cleanAllFailed(queueName),
      'Are you sure that you want to clean all failed jobs?',
      confirmQueueActions
    );

  const cleanAllCompleted = (queueName: string) =>
    withConfirmAndUpdate(
      () => api.cleanAllCompleted(queueName),
      'Are you sure that you want to clean all completed jobs?',
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

  const getJobLogs = (queueName: string) => (job: AppJob) => () =>
    api.getJobLogs(queueName, job.id);

  return {
    state,
    actions: {
      promoteJob,
      retryJob,
      retryAll,
      cleanJob,
      cleanAllDelayed,
      cleanAllFailed,
      cleanAllCompleted,
      getJobLogs,
      pauseQueue,
      resumeQueue,
    },
    confirmProps,
    selectedStatuses,
  };
};
