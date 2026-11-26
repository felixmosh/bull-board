import type { AppJob, AppQueue } from '@bull-board/api/typings/app';
import type { GetQueuesResponse, SearchJobsResponse } from '@bull-board/api/typings/responses';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory } from 'history';
import { useSettingsStore } from '../../src/hooks/useSettings';
import { QueuePage } from '../../src/pages/QueuePage/QueuePage';
import { createWrapper, makeQueue, render } from '../testUtils';

jest.mock('../../src/utils/highlight/highlight', () => ({
  asyncHighlight: async (code: string) => code,
}));

beforeEach(() => {
  useSettingsStore.setState({ pollingInterval: 0, jobsPerPage: 10, confirmJobActions: false });
});

function makeJob(id: string): AppJob {
  return {
    id,
    name: 'order',
    timestamp: 1_700_000_000_000,
    data: { tenantId: 'acme' },
    returnValue: null,
    opts: {},
    progress: 0,
    attempts: 0,
    stacktrace: [],
    failedReason: '',
    isFailed: false,
  } as unknown as AppJob;
}

function renderPage({
  url = '/queue/orders',
  queue = {},
  searchResponses = [{ results: [] }],
  diagnostics = { status: false, inspect: false, coverage: false },
  api = {},
}: {
  url?: string;
  queue?: Partial<AppQueue>;
  searchResponses?: SearchJobsResponse[];
  diagnostics?: { status: boolean; inspect: boolean; coverage: boolean };
  api?: Record<string, unknown>;
} = {}) {
  const queues = [
    makeQueue('orders', {
      searchable: true,
      jobs: [makeJob('page-job')],
      pagination: { pageCount: 3, range: { start: 0, end: 9 } },
      ...queue,
    }),
  ];
  const getQueues = jest.fn(() => Promise.resolve<GetQueuesResponse>({ queues }));
  const getSearchFields = jest.fn(() =>
    Promise.resolve({ fields: ['data.tenantId'], diagnostics })
  );
  const searchJobs = jest.fn();
  searchResponses.forEach((response) => searchJobs.mockResolvedValueOnce(response));
  const history = createMemoryHistory({ initialEntries: [url] });
  const { Wrapper } = createWrapper({
    api: { getQueues, getSearchFields, searchJobs, ...api },
    history,
  });

  const utils = render(<QueuePage />, { wrapper: Wrapper });
  return { ...utils, history, getSearchFields, searchJobs };
}

it('shows no search box and asks for no fields on a queue without a provider', async () => {
  const { getSearchFields } = renderPage({ queue: { searchable: false } });

  await screen.findByText('page-job', { exact: false });
  expect(screen.queryByRole('search')).toBeNull();
  expect(getSearchFields).not.toHaveBeenCalled();
});

it('puts the submitted search in the URL and lists the matching jobs instead of the page', async () => {
  const { history, searchJobs } = renderPage({
    searchResponses: [{ results: [{ job: makeJob('hit-1'), status: 'failed' }] }],
  });

  const input = await screen.findByRole('searchbox');
  expect(screen.getByText('data.tenantId')).toBeTruthy();
  await userEvent.type(input, '  acme {enter}');

  await waitFor(() => expect(history.location.search).toBe('?field=data.tenantId&q=acme'));
  await screen.findByText('hit-1', { exact: false });
  expect(screen.queryByText('page-job', { exact: false })).toBeNull();
  expect(searchJobs).toHaveBeenCalledWith('orders', {
    field: 'data.tenantId',
    value: 'acme',
    status: undefined,
    cursor: undefined,
    limit: 20,
  });
});

it('narrows the search to the selected status and keeps it when switching tabs', async () => {
  const { container, searchJobs } = renderPage({
    url: '/queue/orders?status=failed&field=data.tenantId&q=acme',
  });

  await waitFor(() => expect(searchJobs).toHaveBeenCalled());
  expect(searchJobs.mock.calls[0][1]).toMatchObject({ status: 'failed' });

  const completedTab = container.querySelector('a[href*="status=completed"]');
  expect(completedTab?.getAttribute('href')).toContain('field=data.tenantId&q=acme');
});

it.each([
  ['/queue/orders?status=failed', true],
  ['/queue/orders?status=failed&field=data.tenantId&q=acme', false],
])('on %s shows the bulk actions and pagination: %s', async (url, shown) => {
  const { container } = renderPage({ url });

  await screen.findByRole('searchbox');
  await waitFor(() => expect(!!container.querySelector('.pagination')).toBe(shown));
  expect(!!screen.queryByText('QUEUE.ACTIONS.CLEAN_ALL')).toBe(shown);
});

it('loads the next page with the cursor the provider returned', async () => {
  const { searchJobs } = renderPage({
    url: '/queue/orders?field=data.tenantId&q=acme',
    searchResponses: [
      { results: [{ job: makeJob('hit-1'), status: 'completed' }], cursor: 'c2' },
      { results: [{ job: makeJob('hit-2'), status: 'completed' }] },
    ],
  });

  await userEvent.click(await screen.findByRole('button', { name: 'QUEUE.SEARCH.LOAD_MORE' }));

  await screen.findByText('hit-2', { exact: false });
  expect(screen.getByText('hit-1', { exact: false })).toBeTruthy();
  expect(searchJobs.mock.calls[1][1]).toMatchObject({ cursor: 'c2' });
  expect(screen.queryByRole('button', { name: 'QUEUE.SEARCH.LOAD_MORE' })).toBeNull();
});

it('clears the search back to the plain job list', async () => {
  const { history } = renderPage({ url: '/queue/orders?status=failed&field=data.tenantId&q=acme' });

  await userEvent.click(await screen.findByRole('button', { name: 'QUEUE.SEARCH.CLEAR' }));

  expect(history.location.search).toBe('?status=failed');
  await screen.findByText('page-job', { exact: false });
});

it('hides the queue-wide tab counts while a search is active', async () => {
  const counts = { ...makeQueue('orders').counts, failed: 7 };
  const plain = renderPage({ url: '/queue/orders', queue: { counts } });
  await screen.findByRole('searchbox');
  expect(plain.container.querySelector('a[href*="status=failed"]')?.textContent).toContain('7');
  plain.unmount();

  const searching = renderPage({
    url: '/queue/orders?field=data.tenantId&q=acme',
    queue: { counts },
  });
  await screen.findByText('QUEUE.SEARCH.EMPTY');
  expect(searching.container.querySelector('a[href*="status=failed"]')?.textContent).not.toContain(
    '7'
  );
});

it('focuses the search box on / and clears an active search on Escape', async () => {
  const { history } = renderPage({ url: '/queue/orders?field=data.tenantId&q=acme' });
  const input = await screen.findByRole('searchbox');

  input.blur();
  await userEvent.keyboard('/');
  expect(document.activeElement).toBe(input);

  await userEvent.keyboard('{Escape}');
  expect(history.location.search).toBe('');
});

describe('search index status', () => {
  const diagnostics = { status: true, inspect: false, coverage: false };

  it('reserves the index slot before the status loads', async () => {
    renderPage({
      diagnostics,
      api: { getSearchStatus: jest.fn(() => new Promise(() => {})) },
    });

    const slot = await screen.findByTestId('search-index-slot');
    expect(slot.querySelector('button')).toBeNull();
  });

  it('shows the index health pill with its reasons in the accessible name', async () => {
    renderPage({
      diagnostics,
      api: {
        getSearchStatus: jest.fn(() =>
          Promise.resolve({ health: 'down', reasons: ['INDEXER_NOT_SEEN'] })
        ),
      },
    });

    const pill = await screen.findByRole('button', { name: /QUEUE\.SEARCH\.INDEX\.DOWN/ });
    expect(pill.getAttribute('aria-label')).toContain('QUEUE.SEARCH.INDEX.REASON.INDEXER_NOT_SEEN');
    expect(pill.textContent).toContain('QUEUE.SEARCH.INDEX.DOWN');
  });

  it.each([
    ['rejects', () => Promise.reject(new Error('Network Error'))],
    [
      'answers with an error body',
      () =>
        Promise.resolve({
          error: { key: 'ERRORS.INTERNAL_SERVER_ERROR' },
          code: 'SEARCH_STATUS_UNAVAILABLE',
        }),
    ],
  ])('shows the pill as offline when the status request %s', async (_label, getSearchStatus) => {
    renderPage({ diagnostics, api: { getSearchStatus: jest.fn(getSearchStatus) } });

    const pill = await screen.findByRole('button', { name: /QUEUE\.SEARCH\.INDEX\.DOWN/ });
    expect(pill.getAttribute('aria-label')).toBe(
      'QUEUE.SEARCH.INDEX.TITLE: QUEUE.SEARCH.INDEX.DOWN'
    );
  });

  it('renders no slot and asks for no status without diagnostics', async () => {
    const getSearchStatus = jest.fn();
    renderPage({ api: { getSearchStatus } });

    await screen.findByRole('searchbox');
    expect(screen.queryByTestId('search-index-slot')).toBeNull();
    expect(getSearchStatus).not.toHaveBeenCalled();
  });
});
