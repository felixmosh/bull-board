import type { AppJobScheduler } from '@bull-board/api/typings/app';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useJobSchedulers } from '../../src/hooks/useJobSchedulers';
import { useSettingsStore } from '../../src/hooks/useSettings';
import { createWrapper } from '../testUtils';

const scheduler: AppJobScheduler = {
  id: 'scheduler-1',
  queueName: 'Q1',
  name: 'job-name',
};

beforeEach(() => {
  useSettingsStore.setState({
    pollingInterval: 5,
    jobsPerPage: 10,
    confirmQueueActions: false,
  });
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

it('does not refetch schedulers on the polling interval', async () => {
  const api = { getJobSchedulers: jest.fn(() => Promise.resolve({ schedulers: [scheduler] })) };
  const { Wrapper } = createWrapper({ api });

  const { result } = renderHook(() => useJobSchedulers(), { wrapper: Wrapper });

  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => jest.advanceTimersByTimeAsync(16_000));

  expect(api.getJobSchedulers).toHaveBeenCalledTimes(1);
});

it('refetches schedulers every minute while polling is on', async () => {
  const api = { getJobSchedulers: jest.fn(() => Promise.resolve({ schedulers: [scheduler] })) };
  const { Wrapper } = createWrapper({ api });

  const { result } = renderHook(() => useJobSchedulers(), { wrapper: Wrapper });

  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => jest.advanceTimersByTimeAsync(61_000));

  expect(api.getJobSchedulers).toHaveBeenCalledTimes(2);
});

it('does not refetch schedulers when polling is off', async () => {
  useSettingsStore.setState({ pollingInterval: -1 });
  const api = { getJobSchedulers: jest.fn(() => Promise.resolve({ schedulers: [scheduler] })) };
  const { Wrapper } = createWrapper({ api });

  const { result } = renderHook(() => useJobSchedulers(), { wrapper: Wrapper });

  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => jest.advanceTimersByTimeAsync(61_000));

  expect(api.getJobSchedulers).toHaveBeenCalledTimes(1);
});

it('refetches after a scheduler mutation', async () => {
  const api = {
    getJobSchedulers: jest.fn(() => Promise.resolve({ schedulers: [scheduler] })),
    removeJobScheduler: jest.fn(() => Promise.resolve()),
  };
  const { Wrapper } = createWrapper({ api });

  const { result } = renderHook(() => useJobSchedulers(), { wrapper: Wrapper });

  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => {
    await result.current.actions.remove(scheduler)();
  });

  expect(api.removeJobScheduler).toHaveBeenCalledWith('Q1', 'scheduler-1');
  await waitFor(() => expect(api.getJobSchedulers).toHaveBeenCalledTimes(2));
});
