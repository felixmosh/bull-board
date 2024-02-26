import React from 'react';
import { RedisOptions } from '@bull-board/api/typings/app';
import { useApi } from './useApi';

export function useRedisOptions(): RedisOptions | undefined {
  const [options, setOptions] = React.useState<RedisOptions>();
  const api = useApi();

  React.useEffect(() => {
    api.getStats().then(({ options }) => {
      setOptions(options)
    })
  }, []);

  return options;
}
