import type {
  GetMetricsHistoryResponse,
  GetQueueMetricsResponse,
} from '@bull-board/api/typings/responses';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { QueueMetrics } from '../../src/components/QueueMetrics/QueueMetrics';
import { useSettingsStore } from '../../src/hooks/useSettings';
import { createWrapper, deferred, makeQueue, render } from '../testUtils';

beforeEach(() => {
  useSettingsStore.setState({
    pollingInterval: 0,
    jobsPerPage: 10,
    confirmQueueActions: false,
    collapseMetrics: false,
  });
});

const withMetrics = (): GetQueueMetricsResponse => ({
  completed: { meta: { count: 10, prevTS: Date.now(), prevCount: 8 }, data: [1, 2, 3], count: 10 },
  failed: { meta: { count: 2, prevTS: Date.now(), prevCount: 1 }, data: [0, 1], count: 2 },
});

const withoutMetrics = (): GetQueueMetricsResponse => ({
  completed: { meta: { count: 0, prevTS: Date.now(), prevCount: 0 }, data: [], count: 0 },
  failed: { meta: { count: 0, prevTS: Date.now(), prevCount: 0 }, data: [], count: 0 },
});

const emptyHistory = (): GetMetricsHistoryResponse => ({ completed: [], failed: [] });

function renderQueueMetrics(
  getMetrics: jest.Mock,
  getHistoryMetrics: jest.Mock = jest.fn(() => Promise.resolve(emptyHistory())),
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
  const call = deferred<GetMetricsHistoryResponse>();
  const getHistoryMetrics = jest.fn(() => call.promise);

  const { queue } = renderQueueMetrics(getMetrics, getHistoryMetrics, true);

  await screen.findByRole('tablist');
  expect(getHistoryMetrics).not.toHaveBeenCalled();

  fireEvent.click(screen.getByText('METRICS.RANGE_7D'));

  await waitFor(() =>
    expect(getHistoryMetrics).toHaveBeenCalledWith(
      expect.objectContaining({ queue: queue.name, granularity: 'day' })
    )
  );

  await act(async () => {
    call.resolve({
      completed: [
        { ts: 1000, value: 4 },
        { ts: 2000, value: 6 },
      ],
      failed: [{ ts: 1000, value: 1 }],
    });
  });

  await waitFor(() => expect(screen.getByText('METRICS.DAILY_COMPLETED')).toBeTruthy());
  expect(screen.getByText('METRICS.DAILY_FAILED')).toBeTruthy();
  expect(screen.queryByText('METRICS.HISTORY_EMPTY')).toBeNull();
});

it('shows the bare empty state when there is no data and no history provider', async () => {
  const getMetrics = jest.fn(() => Promise.resolve(withoutMetrics()));

  renderQueueMetrics(getMetrics, undefined, false);

  await waitFor(() => expect(screen.getByText('METRICS.EMPTY')).toBeTruthy());
  expect(screen.queryByRole('tablist')).toBeNull();
});

it('shows the history-empty state when the history query resolves with no points', async () => {
  const getMetrics = jest.fn(() => Promise.resolve(withMetrics()));
  const getHistoryMetrics = jest.fn(() => Promise.resolve(emptyHistory()));

  renderQueueMetrics(getMetrics, getHistoryMetrics, true);

  await screen.findByRole('tablist');
  fireEvent.click(screen.getByText('METRICS.RANGE_7D'));

  await waitFor(() => expect(screen.getByText('METRICS.HISTORY_EMPTY')).toBeTruthy());
  expect(screen.queryByText('METRICS.DAILY_COMPLETED')).toBeNull();
});

describe('empty native buffer with recorded history', () => {
  // Regression: the card used to bail out to the "no metrics" state whenever the native
  // buffer was empty, which happens after a worker restart or once metrics are switched
  // off. That hid the range selector, so recorded history for the queue became
  // unreachable from its own page even though the Metrics history page still showed it.
  it('still offers the range selector so recorded history stays reachable', async () => {
    const getMetrics = jest.fn(() => Promise.resolve(withoutMetrics()));

    renderQueueMetrics(getMetrics, undefined, true);

    await screen.findByRole('tablist');
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    // 60m is still the selected range, and it has genuinely nothing to show.
    await waitFor(() => expect(screen.getByText('METRICS.EMPTY')).toBeTruthy());
  });

  it('switching to a history range renders the recorded series', async () => {
    const getMetrics = jest.fn(() => Promise.resolve(withoutMetrics()));
    const getHistoryMetrics = jest.fn(() =>
      Promise.resolve<GetMetricsHistoryResponse>({
        completed: [
          { ts: Date.UTC(2026, 6, 20), value: 12 },
          { ts: Date.UTC(2026, 6, 21), value: 8 },
        ],
        failed: [],
      })
    );

    renderQueueMetrics(getMetrics, getHistoryMetrics, true);

    fireEvent.click(await screen.findByText('METRICS.RANGE_7D'));

    await waitFor(() => expect(screen.getByText('METRICS.DAILY_COMPLETED')).toBeTruthy());
    expect(screen.queryByText('METRICS.EMPTY')).toBeNull();
  });
});
