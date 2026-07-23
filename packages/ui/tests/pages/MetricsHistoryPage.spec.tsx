import type { AppQueue } from '@bull-board/api/typings/app';
import type {
  GetMetricsHistoryResponse,
  GetQueuesResponse,
} from '@bull-board/api/typings/responses';
import { act, screen, waitFor, within } from '@testing-library/react';
import { useSettingsStore } from '../../src/hooks/useSettings';
import { MetricsHistoryPage } from '../../src/pages/MetricsHistoryPage/MetricsHistoryPage';
import { createWrapper, deferred, render } from '../testUtils';

beforeEach(() => {
  useSettingsStore.setState({
    pollingInterval: 0,
    jobsPerPage: 10,
    confirmQueueActions: false,
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

function renderPage(
  getHistoryMetrics: jest.Mock,
  getQueues: jest.Mock = jest.fn(() => Promise.resolve<GetQueuesResponse>({ queues: [] }))
) {
  const api = { getHistoryMetrics, getQueues };
  const { Wrapper } = createWrapper({ api });
  return render(<MetricsHistoryPage />, { wrapper: Wrapper });
}

it('shows a loading state, then the chart region and summary totals once the metrics resolve', async () => {
  const call = deferred<GetMetricsHistoryResponse>();
  const getHistoryMetrics = jest.fn(() => call.promise);

  renderPage(getHistoryMetrics);

  expect(screen.getByText('METRICS_HISTORY.TITLE')).toBeTruthy();
  expect(screen.getByText('LOADING')).toBeTruthy();

  expect(getHistoryMetrics).toHaveBeenCalledTimes(1);
  expect(getHistoryMetrics).toHaveBeenCalledWith(expect.objectContaining({ granularity: 'day' }));

  await act(async () => {
    call.resolve({
      completed: [
        { ts: 1000, value: 5 },
        { ts: 2000, value: 7 },
      ],
      failed: [
        { ts: 1000, value: 1 },
        { ts: 2000, value: 2 },
      ],
    });
  });

  await waitFor(() => expect(screen.queryByText('LOADING')).toBeNull());

  expect(screen.getByText('METRICS_HISTORY.TOTAL_COMPLETED')).toBeTruthy();
  expect(screen.getByText('12')).toBeTruthy(); // 5 + 7 completed
  expect(screen.getByText('METRICS_HISTORY.TOTAL_FAILED')).toBeTruthy();
  expect(screen.getByText('3')).toBeTruthy(); // 1 + 2 failed
  expect(screen.queryByText('METRICS_HISTORY.EMPTY')).toBeNull();
});

it('shows the empty state when both metrics resolve to no points', async () => {
  const getHistoryMetrics = jest.fn(() =>
    Promise.resolve<GetMetricsHistoryResponse>({ completed: [], failed: [] })
  );

  renderPage(getHistoryMetrics);

  await waitFor(() => expect(screen.queryByText('METRICS_HISTORY.EMPTY')).toBeTruthy());
  expect(screen.queryByText('METRICS_HISTORY.TOTAL_COMPLETED')).toBeNull();
});

it('renders a per-queue breakdown table sorted by completed count, querying each queue by name', async () => {
  const getQueues = jest.fn(() =>
    Promise.resolve<GetQueuesResponse>({ queues: [makeQueue('Q1'), makeQueue('Q2')] })
  );

  const getHistoryMetrics = jest.fn((params: { queue?: string }) => {
    if (!params.queue) {
      return Promise.resolve<GetMetricsHistoryResponse>({ completed: [], failed: [] });
    }
    if (params.queue === 'Q1') {
      return Promise.resolve<GetMetricsHistoryResponse>({
        completed: [
          { ts: 1000, value: 4 },
          { ts: 2000, value: 6 },
        ],
        failed: [{ ts: 1000, value: 2 }],
      });
    }
    if (params.queue === 'Q2') {
      return Promise.resolve<GetMetricsHistoryResponse>({
        completed: [{ ts: 1000, value: 3 }],
        failed: [{ ts: 1000, value: 1 }],
      });
    }
    return Promise.resolve<GetMetricsHistoryResponse>({ completed: [], failed: [] });
  });

  renderPage(getHistoryMetrics, getQueues);

  await waitFor(() => expect(screen.getByText('METRICS_HISTORY.BY_QUEUE')).toBeTruthy());

  const table = screen.getByRole('table');
  await waitFor(() => expect(within(table).getByText('10')).toBeTruthy());

  const q1Row = screen.getByText('Q1').closest('tr') as HTMLElement;
  const q2Row = screen.getByText('Q2').closest('tr') as HTMLElement;
  expect(within(q1Row).getByText('10')).toBeTruthy(); // Q1 completed: 4 + 6
  expect(within(q1Row).getByText('2')).toBeTruthy(); // Q1 failed
  expect(within(q2Row).getByText('3')).toBeTruthy(); // Q2 completed
  expect(within(q2Row).getByText('1')).toBeTruthy(); // Q2 failed

  // Q1 (10 completed) should render above Q2 (3 completed).
  const dataRows = within(table).getAllByRole('row').slice(1);
  expect(within(dataRows[0]).getByText('Q1')).toBeTruthy();
  expect(within(dataRows[1]).getByText('Q2')).toBeTruthy();

  const perQueueCalls = getHistoryMetrics.mock.calls.filter(([params]) => Boolean(params.queue));
  expect(perQueueCalls.length).toBe(2); // 1 call per queue
  for (const [params] of perQueueCalls) {
    expect(['Q1', 'Q2']).toContain(params.queue);
  }
  expect(perQueueCalls.filter(([p]) => p.queue === 'Q1').length).toBe(1);
  expect(perQueueCalls.filter(([p]) => p.queue === 'Q2').length).toBe(1);
});
