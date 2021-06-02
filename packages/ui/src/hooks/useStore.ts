import { useState } from 'react';

import { Api } from '../services/Api';
import { useInterval } from './useInterval';
import { useSelectedStatuses } from './useSelectedStatuses';
import { QueueActions, SelectedStatuses } from '../../typings/app';
import { AppJob } from '@bull-board/api/typings/app';
import { GetQueuesResponse } from '@bull-board/api/typings/responses';
import { useQuery } from './useQuery';

const interval = 5000;

type State = {
  data: null | GetQueuesResponse;
  loading: boolean;
};

export interface Store {
  state: State;
  actions: QueueActions;
  selectedStatuses: SelectedStatuses;
}

export const useStore = (api: Api): Store => {
  const query = useQuery();
  const [state, setState] = useState<State>({
    data: null,
    loading: true,
  });

  const selectedStatuses = useSelectedStatuses();

  const update = () =>
    api
      .getQueues({ status: selectedStatuses, page: query.get('page') || '1' })
      .then((data) => {
        setState({ data, loading: false });
      })
      // eslint-disable-next-line no-console
      .catch((error) => console.error('Failed to poll', error));

  useInterval(update, interval, [selectedStatuses]);

  const promoteJob = (queueName: string) => (job: AppJob) => () =>
    api.promoteJob(queueName, job.id).then(update);

  const retryJob = (queueName: string) => (job: AppJob) => () =>
    api.retryJob(queueName, job.id).then(update);

  const cleanJob = (queueName: string) => (job: AppJob) => () =>
    api.cleanJob(queueName, job.id).then(update);

  const retryAll = (queueName: string) => () => api.retryAll(queueName).then(update);

  const cleanAllDelayed = (queueName: string) => () => api.cleanAllDelayed(queueName).then(update);

  const cleanAllFailed = (queueName: string) => () => api.cleanAllFailed(queueName).then(update);

  const cleanAllCompleted = (queueName: string) => () =>
    api.cleanAllCompleted(queueName).then(update);

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
    selectedStatuses,
  };
};
