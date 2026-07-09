import type { GetMetricsHistoryResponse } from '@bull-board/api/typings/responses';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useHistoryMetrics, UseHistoryMetricsParams } from '../../src/hooks/useHistoryMetrics';
import { useSettingsStore } from '../../src/hooks/useSettings';
import { createWrapper, deferred } from '../testUtils';

const baseParams: UseHistoryMetricsParams = {
  queue: 'Q1',
  metric: 'completed',
  from: 1000,
  to: 2000,
  granularity: 'hour',
};

beforeEach(() => {
  useSettingsStore.setState({
    pollingInterval: 0,
    jobsPerPage: 10,
    confirmQueueActions: false,
  });
});

it('does not call the api and returns no points when disabled', async () => {
  const api = { getHistoryMetrics: jest.fn() };
  const { Wrapper } = createWrapper({ api });

  const { result } = renderHook(() => useHistoryMetrics(baseParams, false), { wrapper: Wrapper });

  expect(result.current.points).toEqual([]);
  expect(api.getHistoryMetrics).not.toHaveBeenCalled();
});

it('calls the api with the passed params and exposes points once resolved', async () => {
  const call = deferred<GetMetricsHistoryResponse>();
  const api = { getHistoryMetrics: jest.fn(() => call.promise) };
  const { Wrapper } = createWrapper({ api });

  const { result } = renderHook(() => useHistoryMetrics(baseParams, true), { wrapper: Wrapper });

  expect(result.current.loading).toBe(true);
  expect(result.current.points).toEqual([]);
  expect(api.getHistoryMetrics).toHaveBeenCalledWith(baseParams);

  await act(async () => {
    call.resolve({ points: [{ ts: 1500, value: 42 }] });
  });

  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.points).toEqual([{ ts: 1500, value: 42 }]);
});
