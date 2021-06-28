import { useState } from 'react';

import { Api } from '../services/Api';
import { useInterval } from './useInterval';
import { useSelectedStatuses } from './useSelectedStatuses';
import { QueueActions, SelectedStatuses } from '../../typings/app';
import { AppJob } from '@bull-board/api/typings/app';
import { GetQueuesResponse } from '@bull-board/api/typings/responses';
import { useQuery } from './useQuery';
import { ConfirmApi, useConfirm } from './useConfirm';

const interval = 5000;

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

export const useStore = (api: Api): Store => {
  const query = useQuery();
  const [state, setState] = useState<State>({
    data: null,
    loading: true,
  });
  const { confirmProps, openConfirm } = useConfirm();

  const selectedStatuses = useSelectedStatuses();

  const update = () =>
    api
      .getQueues({ status: selectedStatuses, page: query.get('page') || '1' })
      .then((data) => {
        setState({ data, loading: false });
      })
      // eslint-disable-next-line no-console
      .catch((error) => console.error('Failed to poll', error));

  function withConfirmAndUpdate(action: () => Promise<any>, description: string) {
    return async () => {
      try {
        await openConfirm({ description });
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

  useInterval(update, interval, [selectedStatuses]);

  const promoteJob = (queueName: string) => (job: AppJob) =>
    withConfirmAndUpdate(
      () => api.promoteJob(queueName, job.id),
      'Are you sure that you want to promote this job?'
    );

  const retryJob = (queueName: string) => (job: AppJob) =>
    withConfirmAndUpdate(
      () => api.retryJob(queueName, job.id),
      'Are you sure that you want to retry this job?'
    );

  const cleanJob = (queueName: string) => (job: AppJob) =>
    withConfirmAndUpdate(
      () => api.cleanJob(queueName, job.id),
      'Are you sure that you want to clean this job?'
    );

  const retryAll = (queueName: string) =>
    withConfirmAndUpdate(
      () => api.retryAll(queueName),
      'Are you sure that you want to retry all jobs?'
    );

  const cleanAllDelayed = (queueName: string) =>
    withConfirmAndUpdate(
      () => api.cleanAllDelayed(queueName),
      'Are you sure that you want to clean all delayed jobs?'
    );

  const cleanAllFailed = (queueName: string) =>
    withConfirmAndUpdate(
      () => api.cleanAllFailed(queueName),
      'Are you sure that you want to clean all failed jobs?'
    );

  const cleanAllCompleted = (queueName: string) =>
    withConfirmAndUpdate(
      () => api.cleanAllCompleted(queueName),
      'Are you sure that you want to clean all completed jobs?'
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
    },
    confirmProps,
    selectedStatuses,
  };
};
