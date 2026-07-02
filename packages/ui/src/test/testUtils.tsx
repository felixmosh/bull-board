import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryHistory, MemoryHistory } from 'history';
import { PropsWithChildren } from 'react';
import { Router } from 'react-router-dom';
import { ApiContext } from '../hooks/useApi';
import type { Api } from '../services/Api';

export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export type MockApi = Partial<{
  [K in keyof Api]: Api[K] extends (...args: infer A) => unknown ? (...args: A) => unknown : Api[K];
}>;

interface WrapperOptions {
  api: MockApi;
  history?: MemoryHistory;
}

export function createWrapper({ api, history = createMemoryHistory() }: WrapperOptions) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const Wrapper = ({ children }: PropsWithChildren<unknown>) => (
    <QueryClientProvider client={queryClient}>
      <Router history={history}>
        <ApiContext.Provider value={api as unknown as Api}>{children}</ApiContext.Provider>
      </Router>
    </QueryClientProvider>
  );

  return { Wrapper, queryClient, history };
}

export { render };
