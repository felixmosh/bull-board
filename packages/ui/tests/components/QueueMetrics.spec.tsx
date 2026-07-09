import type { AppQueue } from '@bull-board/api/typings/app';
import type {
  GetMetricsHistoryResponse,
  GetQueueMetricsResponse,
} from '@bull-board/api/typings/responses';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { QueueMetrics } from '../../src/components/QueueMetrics/QueueMetrics';
import { useSettingsStore } from '../../src/hooks/useSettings';
import { createWrapper, deferred, Deferred, render } from '../testUtils';

beforeEach(() => {
  useSettingsStore.setState({
    pollingInterval: 0,
    jobsPerPage: 10,
    confirmQueueActions: false,
    collapseMetrics: false,
  });
});

function makeQueue(name: string): AppQueue {
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
  };
}

const withMetrics = (): GetQueueMetricsResponse => ({
  completed: { meta: { count: 10, prevTS: Date.now(), prevCount: 8 }, data: [1, 2, 3], count: 10 },
  failed: { meta: { count: 2, prevTS: Date.now(), prevCount: 1 }, data: [0, 1], count: 2 },
});

const withoutMetrics = (): GetQueueMetricsResponse => ({
  completed: { meta: { count: 0, prevTS: Date.now(), prevCount: 0 }, data: [], count: 0 },
  failed: { meta: { count: 0, prevTS: Date.now(), prevCount: 0 }, data: [], count: 0 },
});

function renderQueueMetrics(
  getMetrics: jest.Mock,
  getHistoryMetrics: jest.Mock = jest.fn(() =>
    Promise.resolve<GetMetricsHistoryResponse>({ points: [] })
  ),
  hasHistoryProvider = false
) {
  const api = { getMetrics, getHistoryMetrics };
  const { Wrapper } = createWrapper({ api, uiConfig: { hasHistoryProvider } });
  const queue = makeQueue('Q1');
  render(<QueueMetrics queue={queue} />, { wrapper: Wrapper });
  return { queue };
}

it('collapse toggle persists to settings and hides the chart/summary/range-selector subtree', async () => {
  const getMetrics = jest.fn(() => Promise.resolve(withMetrics()));

  renderQueueMetrics(getMetrics, undefined, true);

  const toggle = await screen.findByRole('button', { name: 'METRICS.TITLE' });
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  // Expanded: legend, range selector, and native summary stats are present.
  expect(screen.getByText('METRICS.COMPLETED')).toBeTruthy();
  expect(screen.getByRole('tablist')).toBeTruthy();
  expect(screen.getByText('METRICS.COMPLETED_PER_MIN')).toBeTruthy();

  fireEvent.click(toggle);

  expect(useSettingsStore.getState().collapseMetrics).toBe(true);
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByText('METRICS.COMPLETED')).toBeNull();
  expect(screen.queryByRole('tablist')).toBeNull();
  expect(screen.queryByText('METRICS.COMPLETED_PER_MIN')).toBeNull();
});

it('hides the range-selector tablist when hasHistoryProvider is false', async () => {
  const getMetrics = jest.fn(() => Promise.resolve(withMetrics()));

  renderQueueMetrics(getMetrics, undefined, false);

  await screen.findByRole('button', { name: 'METRICS.TITLE' });
  expect(screen.queryByRole('tablist')).toBeNull();
});

it('shows the range-selector tablist with all four range tabs when hasHistoryProvider is true', async () => {
  const getMetrics = jest.fn(() => Promise.resolve(withMetrics()));

  renderQueueMetrics(getMetrics, undefined, true);

  const tablist = await screen.findByRole('tablist');
  const tabs = screen.getAllByRole('tab');
  expect(tabs).toHaveLength(4);
  expect(tablist).toBeTruthy();
  expect(screen.getByText('METRICS.RANGE_60M')).toBeTruthy();
  expect(screen.getByText('METRICS.RANGE_7D')).toBeTruthy();
  expect(screen.getByText('METRICS.RANGE_30D')).toBeTruthy();
  expect(screen.getByText('METRICS.RANGE_90D')).toBeTruthy();
});

it('switches from native to history metrics and calls getHistoryMetrics with the queue + granularity', async () => {
  const getMetrics = jest.fn(() => Promise.resolve(withMetrics()));
  const calls: Deferred<GetMetricsHistoryResponse>[] = [];
  const getHistoryMetrics = jest.fn(
    (_params: { queue?: string; metric: string; granularity: string }) => {
      const call = deferred<GetMetricsHistoryResponse>();
      calls.push(call);
      return call.promise;
    }
  );

  const { queue } = renderQueueMetrics(getMetrics, getHistoryMetrics, true);

  await screen.findByRole('tablist');
  expect(getHistoryMetrics).not.toHaveBeenCalled();

  fireEvent.click(screen.getByText('METRICS.RANGE_7D'));

  await waitFor(() => expect(getHistoryMetrics).toHaveBeenCalledTimes(2));

  const completedCall = getHistoryMetrics.mock.calls.find(([p]) => p.metric === 'completed');
  const failedCall = getHistoryMetrics.mock.calls.find(([p]) => p.metric === 'failed');
  expect(completedCall?.[0]).toMatchObject({
    queue: queue.name,
    metric: 'completed',
    granularity: 'day',
  });
  expect(failedCall?.[0]).toMatchObject({
    queue: queue.name,
    metric: 'failed',
    granularity: 'day',
  });

  const completedIndex = getHistoryMetrics.mock.calls.findIndex(([p]) => p.metric === 'completed');
  const failedIndex = getHistoryMetrics.mock.calls.findIndex(([p]) => p.metric === 'failed');

  await act(async () => {
    calls[completedIndex].resolve({
      points: [
        { ts: 1000, value: 4 },
        { ts: 2000, value: 6 },
      ],
    });
    calls[failedIndex].resolve({
      points: [{ ts: 1000, value: 1 }],
    });
  });

  await waitFor(() => expect(screen.getByText('METRICS.DAILY_COMPLETED')).toBeTruthy());
  expect(screen.getByText('METRICS.DAILY_FAILED')).toBeTruthy();
  expect(screen.queryByText('METRICS.HISTORY_EMPTY')).toBeNull();
});

it('shows the empty state and no range-selector when getMetrics resolves with no data', async () => {
  const getMetrics = jest.fn(() => Promise.resolve(withoutMetrics()));

  renderQueueMetrics(getMetrics, undefined, true);

  await waitFor(() => expect(screen.getByText('METRICS.EMPTY')).toBeTruthy());
  expect(screen.queryByRole('tablist')).toBeNull();
  expect(screen.queryByRole('button', { name: 'METRICS.TITLE' })).toBeNull();
});

it('shows the history-empty state when the history query resolves with no points', async () => {
  const getMetrics = jest.fn(() => Promise.resolve(withMetrics()));
  const getHistoryMetrics = jest.fn(() =>
    Promise.resolve<GetMetricsHistoryResponse>({ points: [] })
  );

  renderQueueMetrics(getMetrics, getHistoryMetrics, true);

  await screen.findByRole('tablist');
  fireEvent.click(screen.getByText('METRICS.RANGE_7D'));

  await waitFor(() => expect(screen.getByText('METRICS.HISTORY_EMPTY')).toBeTruthy());
  expect(screen.queryByText('METRICS.DAILY_COMPLETED')).toBeNull();
});
