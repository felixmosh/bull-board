import { useState } from 'react';
import * as api from '../../@types/api';
import { AppJob, QueueActions, SelectedStatuses } from '../../@types/app';
import { Api } from '../services/Api';
import { useInterval } from './useInterval';
import { useSelectedStatuses } from './useSelectedStatuses';

const interval = 5000;

type State = {
  data: null | api.GetQueues;
  loading: boolean;
};

export interface Store {
  state: State;
  actions: QueueActions;
  selectedStatuses: SelectedStatuses;
}

export const useStore = (api: Api): Store => {
  const [state, setState] = useState<State>({
    data: null,
    loading: true,
  });

  const selectedStatuses = useSelectedStatuses();

  const update = () =>
    api
      .getQueues({ status: selectedStatuses })
      .then((data: api.GetQueues) => {
        setState({ data, loading: false });
      })
      // eslint-disable-next-line no-console
      .catch((error) => console.error('Failed to poll', error));

  useInterval(update, interval, [selectedStatuses]);

  const promoteJob = (queueName: string) => (job: AppJob) => () => api.promoteJob(queueName, job.id).then(update);

  const retryJob = (queueName: string) => (job: AppJob) => () => api.retryJob(queueName, job.id).then(update);

  const cleanJob = (queueName: string) => (job: AppJob) => () => api.cleanJob(queueName, job.id).then(update);

  const retryAll = (queueName: string) => () => api.retryAll(queueName).then(update);

  const cleanAllDelayed = (queueName: string) => () => api.cleanAllDelayed(queueName).then(update);

  const cleanAllFailed = (queueName: string) => () => api.cleanAllFailed(queueName).then(update);

  const cleanAllCompleted = (queueName: string) => () => api.cleanAllCompleted(queueName).then(update);

  const getJobLogs = (queueName: string) => (job: AppJob) => () => api.getJobLogs(queueName, job.id);

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
    selectedStatuses,
  };
};
