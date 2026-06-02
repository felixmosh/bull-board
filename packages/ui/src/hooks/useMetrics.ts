import { GetQueueMetricsResponse } from '@bull-board/api/typings/responses';
import { useState } from 'react';
import { useApi } from './useApi';
import { useInterval } from './useInterval';
import { useSettingsStore } from './useSettings';

export function useMetrics(queueName: string | null) {
  const api = useApi();
  const [metrics, setMetrics] = useState<GetQueueMetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const pollingInterval = useSettingsStore(({ pollingInterval }) => pollingInterval);

  const getMetrics = () => {
    if (!queueName) {
      return Promise.resolve();
    }

    return api
      .getMetrics(queueName)
      .then((data) => setMetrics(data))
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error('Failed to fetch metrics', error);
      })
      .finally(() => setLoading(false));
  };

  useInterval(getMetrics, pollingInterval > 0 ? pollingInterval * 1000 : null, [queueName]);

  return { metrics, loading };
}
