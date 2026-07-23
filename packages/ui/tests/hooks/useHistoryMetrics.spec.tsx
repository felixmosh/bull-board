import type { GetMetricsHistoryResponse } from '@bull-board/api/typings/responses';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useHistoryMetrics, UseHistoryMetricsParams } from '../../src/hooks/useHistoryMetrics';
import { useSettingsStore } from '../../src/hooks/useSettings';
import { createWrapper, deferred } from '../testUtils';

const baseParams: UseHistoryMetricsParams = {
  queue: 'Q1',
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

it('calls the api with the passed params and exposes both metric arrays once resolved', async () => {
  const call = deferred<GetMetricsHistoryResponse>();
  const api = { getHistoryMetrics: jest.fn(() => call.promise) };
  const { Wrapper } = createWrapper({ api });

  const { result } = renderHook(() => useHistoryMetrics(baseParams), { wrapper: Wrapper });

  expect(result.current.loading).toBe(true);
  expect(result.current.completed).toEqual([]);
  expect(result.current.failed).toEqual([]);
  expect(api.getHistoryMetrics).toHaveBeenCalledWith(baseParams);

  await act(async () => {
    call.resolve({
      completed: [{ ts: 1500, value: 42 }],
      failed: [{ ts: 1500, value: 7 }],
    });
  });

  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.completed).toEqual([{ ts: 1500, value: 42 }]);
  expect(result.current.failed).toEqual([{ ts: 1500, value: 7 }]);
});
