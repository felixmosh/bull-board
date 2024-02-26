import React from 'react';
import { RedisOptions } from '@bull-board/api/typings/app';
import { useApi } from './useApi';

export function useRedisOptions(): RedisOptions | undefined {
  const [options, setOptions] = React.useState<RedisOptions>();
  const api = useApi();

  React.useEffect(() => {
    console.log("HOLA"); // eslint-disable-line no-console
    api.getStats().then(({ options }) => {
      console.log("API CALL", options); // eslint-disable-line no-console
      setOptions(options)
    }).catch((e) => {
      console.error(e); // eslint-disable-line no-console
    });
  }, []);
  console.log("useRedisOptions", options); // eslint-disable-line no-console

  return options;
}
