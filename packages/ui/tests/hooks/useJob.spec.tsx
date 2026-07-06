import type { AppJob } from '@bull-board/api/typings/app';
import type { GetJobResponse } from '@bull-board/api/typings/responses';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { useJob } from '../../src/hooks/useJob';
import { useSettingsStore } from '../../src/hooks/useSettings';
import { createWrapper, deferred, Deferred } from '../testUtils';

function makeJobResponse(id: string): GetJobResponse {
  return { job: { id, name: 'process' } as AppJob, status: 'completed' };
}

beforeEach(() => {
  useSettingsStore.setState({ pollingInterval: 0, jobsPerPage: 10, confirmJobActions: false });
});

it('does not fetch until a job id is present in the route', async () => {
  const api = {
    getJob: jest.fn(() => Promise.resolve(makeJobResponse('1'))),
    getQueues: jest.fn(() => Promise.resolve({ queues: [] })),
  };
  const { Wrapper } = createWrapper({
    api,
    history: createMemoryHistory({ initialEntries: ['/queue/Q1'] }),
  });

  renderHook(() => useJob(), { wrapper: Wrapper });

  expect(api.getJob).not.toHaveBeenCalled();
});

it('loads a job once the route carries a job id', async () => {
  const call = deferred<GetJobResponse>();
  const api = {
    getJob: jest.fn(() => call.promise),
    getQueues: jest.fn(() => Promise.resolve({ queues: [] })),
  };
  const { Wrapper } = createWrapper({
    api,
    history: createMemoryHistory({ initialEntries: ['/queue/Q1/42'] }),
  });

  const { result } = renderHook(() => useJob(), { wrapper: Wrapper });
  expect(result.current.loading).toBe(true);

  await act(async () => {
    call.resolve(makeJobResponse('42'));
  });

  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(api.getJob).toHaveBeenCalledWith('Q1', '42');
  expect(result.current.job?.id).toBe('42');
  expect(result.current.status).toBe('completed');
});

it('flags isTransitioning while switching between jobs, then clears it', async () => {
  const calls: Deferred<GetJobResponse>[] = [];
  const api = {
    getJob: jest.fn(() => {
      const call = deferred<GetJobResponse>();
      calls.push(call);
      return call.promise;
    }),
    getQueues: jest.fn(() => Promise.resolve({ queues: [] })),
  };
  const history = createMemoryHistory({ initialEntries: ['/queue/Q1/1'] });
  const { Wrapper } = createWrapper({ api, history });

  const { result } = renderHook(() => useJob(), { wrapper: Wrapper });

  await act(async () => {
    calls[0].resolve(makeJobResponse('1'));
  });
  await waitFor(() => expect(result.current.job?.id).toBe('1'));
  expect(result.current.isTransitioning).toBe(false);

  act(() => {
    history.push('/queue/Q1/2');
  });

  await waitFor(() => expect(result.current.isTransitioning).toBe(true));
  expect(result.current.job?.id).toBe('1');

  await act(async () => {
    calls[calls.length - 1].resolve(makeJobResponse('2'));
  });

  await waitFor(() => expect(result.current.isTransitioning).toBe(false));
  expect(result.current.job?.id).toBe('2');
});
