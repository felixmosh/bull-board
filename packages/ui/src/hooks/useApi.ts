import React, { useContext } from 'react';
import { Api } from '../services/Api';

export const ApiContext = React.createContext<Api>(null as any);

export function useApi() {
  return useContext(ApiContext);
}
