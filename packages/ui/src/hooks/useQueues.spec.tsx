import type { AppQueue } from '@bull-board/api/typings/app';
import type { GetQueuesResponse } from '@bull-board/api/typings/responses';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { createWrapper, deferred, Deferred } from '../test/testUtils';
import { useQueues } from './useQueues';
import { useSettingsStore } from './useSettings';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function makeQueue(name: string, overrides: Partial<AppQueue> = {}): AppQueue {
  return {
    delimiter: '.',
    name,
    counts: {
      active: 0,
      completed: 0,
      delayed: 0,
      failed: 0,
      paused: 0,
      prioritized: 0,
      waiting: 0,
      'waiting-children': 0,
      latest: 0,
    },
    jobs: [],
    statuses: ['waiting', 'completed', 'failed'],
    pagination: { pageCount: 1, range: { start: 0, end: 9 } },
    readOnlyMode: false,
    allowRetries: true,
    allowCompletedRetries: true,
    isPaused: false,
    type: 'bullmq',
    globalConcurrency: null,
    ...overrides,
  };
}

beforeEach(() => {
  useSettingsStore.setState({
    pollingInterval: 0,
    jobsPerPage: 10,
    confirmQueueActions: false,
  });
});

it('exposes loading until the first response, then the mapped queues', async () => {
  const call = deferred<GetQueuesResponse>();
  const api = { getQueues: jest.fn(() => call.promise) };
  const { Wrapper } = createWrapper({
    api,
    history: createMemoryHistory({ initialEntries: ['/queue/Q1?status=waiting'] }),
  });

  const { result } = renderHook(() => useQueues(), { wrapper: Wrapper });

  expect(result.current.loading).toBe(true);
  expect(result.current.queues).toBeNull();

  await act(async () => {
    call.resolve({ queues: [makeQueue('Q1')] });
  });

  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.queues).toHaveLength(1);
  expect(result.current.queues?.[0].name).toBe('Q1');
});

it('defaults a missing displayName to the queue name', async () => {
  const call = deferred<GetQueuesResponse>();
  const api = { getQueues: jest.fn(() => call.promise) };
  const { Wrapper } = createWrapper({
    api,
    history: createMemoryHistory({ initialEntries: ['/queue/Q1'] }),
  });

  const { result } = renderHook(() => useQueues(), { wrapper: Wrapper });
  await act(async () => {
    call.resolve({ queues: [makeQueue('Q1', { displayName: undefined })] });
  });

  await waitFor(() => expect(result.current.queues).not.toBeNull());
  expect(result.current.queues?.[0].displayName).toBe('Q1');
});

it('flags isTransitioning while a status switch is in flight, then clears it', async () => {
  const calls: Deferred<GetQueuesResponse>[] = [];
  const api = {
    getQueues: jest.fn(() => {
      const call = deferred<GetQueuesResponse>();
      calls.push(call);
      return call.promise;
    }),
  };
  const history = createMemoryHistory({ initialEntries: ['/queue/Q1?status=waiting'] });
  const { Wrapper } = createWrapper({ api, history });

  const { result } = renderHook(() => useQueues(), { wrapper: Wrapper });

  await act(async () => {
    calls[0].resolve({ queues: [makeQueue('Q1', { jobs: [{ id: 'waiting-job' } as any] })] });
  });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.isTransitioning).toBe(false);

  act(() => {
    history.push('/queue/Q1?status=completed');
  });

  await waitFor(() => expect(result.current.isTransitioning).toBe(true));
  expect(result.current.queues?.[0].jobs[0].id).toBe('waiting-job');

  await act(async () => {
    calls[calls.length - 1].resolve({
      queues: [makeQueue('Q1', { jobs: [{ id: 'completed-job' } as any] })],
    });
  });

  await waitFor(() => expect(result.current.isTransitioning).toBe(false));
  expect(result.current.queues?.[0].jobs[0].id).toBe('completed-job');
});

it('refetches after a queue mutation resolves', async () => {
  const call = deferred<GetQueuesResponse>();
  const api = {
    getQueues: jest.fn(() => Promise.resolve({ queues: [makeQueue('Q1')] })),
    pauseQueue: jest.fn(() => Promise.resolve()),
  };
  api.getQueues.mockImplementationOnce(() => call.promise);

  const { Wrapper } = createWrapper({
    api,
    history: createMemoryHistory({ initialEntries: ['/queue/Q1?status=waiting'] }),
  });
  const { result } = renderHook(() => useQueues(), { wrapper: Wrapper });

  await act(async () => {
    call.resolve({ queues: [makeQueue('Q1')] });
  });
  await waitFor(() => expect(result.current.loading).toBe(false));

  const initialCalls = api.getQueues.mock.calls.length;

  await act(async () => {
    await result.current.actions.pauseQueue('Q1')();
  });

  expect(api.pauseQueue).toHaveBeenCalledWith('Q1');
  await waitFor(() => expect(api.getQueues.mock.calls.length).toBeGreaterThan(initialCalls));
});
