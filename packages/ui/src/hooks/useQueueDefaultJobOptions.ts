import { GetQueueDefaultJobOptionsResponse } from '@bull-board/api/typings/responses';
import { useEffect, useState } from 'react';
import { useApi } from './useApi';

export function useQueueDefaultJobOptions(queueName: string | null, enabled: boolean) {
  const api = useApi();
  const [defaultJobOptions, setDefaultJobOptions] =
    useState<GetQueueDefaultJobOptionsResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !queueName) return;

    let cancelled = false;
    setLoading(true);
    api
      .getQueueDefaultJobOptions(queueName)
      .then((data) => {
        if (!cancelled) setDefaultJobOptions(data);
      })
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error('Failed to fetch default job options', error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [queueName, enabled]);

  return { defaultJobOptions, loading };
}
