import { GetQueueJobDataSchemaResponse } from '@bull-board/api/typings/responses';
import { useEffect, useState } from 'react';
import { useApi } from './useApi';

export function useQueueJobDataSchema(queueName: string | null, enabled: boolean) {
  const api = useApi();
  const [jobDataSchema, setJobDataSchema] = useState<GetQueueJobDataSchemaResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !queueName) return;

    let cancelled = false;
    setLoading(true);
    setJobDataSchema(null);
    api
      .getQueueJobDataSchema(queueName)
      .then((data) => {
        if (!cancelled) setJobDataSchema(data);
      })
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error('Failed to fetch job data schema', error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [queueName, enabled]);

  return { jobDataSchema, loading };
}
