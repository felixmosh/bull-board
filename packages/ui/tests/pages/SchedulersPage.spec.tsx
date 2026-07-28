import type { AppJobScheduler } from '@bull-board/api/typings/app';
import type {
  GetJobSchedulersResponse,
  GetQueuesResponse,
} from '@bull-board/api/typings/responses';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { useSettingsStore } from '../../src/hooks/useSettings';
import { SchedulersPage } from '../../src/pages/SchedulersPage/SchedulersPage';
import { createWrapper, makeQueue, render } from '../testUtils';

beforeEach(() => {
  useSettingsStore.setState({
    pollingInterval: 0,
    jobsPerPage: 10,
    confirmQueueActions: false,
  });
});

function makeScheduler(overrides: Partial<AppJobScheduler> = {}): AppJobScheduler {
  return {
    id: 'daily-report',
    queueName: 'reports',
    name: 'report',
    pattern: '0 3 * * *',
    next: Date.now() + 60_000,
    iterationCount: 4,
    ...overrides,
  };
}

function renderPage({
  schedulers = [makeScheduler()],
  queues = [makeQueue('reports')],
  path = '/job-schedulers',
  api: apiOverrides = {},
}: {
  schedulers?: AppJobScheduler[];
  queues?: ReturnType<typeof makeQueue>[];
  path?: string;
  api?: Record<string, unknown>;
} = {}) {
  const getJobSchedulers = jest.fn(() => Promise.resolve<GetJobSchedulersResponse>({ schedulers }));
  const getQueues = jest.fn(() => Promise.resolve<GetQueuesResponse>({ queues }));
  const history = createMemoryHistory({ initialEntries: [path] });
  const { Wrapper } = createWrapper({
    api: { getJobSchedulers, getQueues, ...apiOverrides },
    history,
  });

  render(<SchedulersPage />, { wrapper: Wrapper });

  return { getJobSchedulers, getQueues, history };
}

it('lists a scheduler with its schedule, queue and run count', async () => {
  renderPage();

  expect(await screen.findByText('daily-report')).toBeTruthy();
  expect(screen.getByText('0 3 * * *')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'reports' }).getAttribute('href')).toContain(
    '/queue/reports'
  );
  expect(screen.getByText('4')).toBeTruthy();
});

it('asks the API only for the queue named in the URL', async () => {
  const { getJobSchedulers } = renderPage({ path: '/job-schedulers?queueName=reports' });

  await waitFor(() => expect(getJobSchedulers).toHaveBeenCalledWith('reports'));
});

it('shows an empty state when nothing is scheduled', async () => {
  renderPage({ schedulers: [] });

  expect(await screen.findByText('SCHEDULERS.EMPTY')).toBeTruthy();
});

it('offers editing and removal for a writable BullMQ queue', async () => {
  renderPage();

  expect(await screen.findByLabelText('SCHEDULERS.ACTIONS.EDIT')).toBeTruthy();
  expect(screen.getByLabelText('SCHEDULERS.ACTIONS.REMOVE')).toBeTruthy();
});

it('hides editing for a legacy Bull queue, which has no upsert', async () => {
  renderPage({
    schedulers: [makeScheduler({ queueName: 'legacy' })],
    queues: [makeQueue('legacy', { type: 'bull' })],
  });

  expect(await screen.findByLabelText('SCHEDULERS.ACTIONS.REMOVE')).toBeTruthy();
  expect(screen.queryByLabelText('SCHEDULERS.ACTIONS.EDIT')).toBeNull();
});

it('hides both actions on a read only queue', async () => {
  renderPage({
    schedulers: [makeScheduler({ queueName: 'frozen' })],
    queues: [makeQueue('frozen', { readOnlyMode: true })],
  });

  await screen.findByText('daily-report');
  expect(screen.queryByLabelText('SCHEDULERS.ACTIONS.EDIT')).toBeNull();
  expect(screen.queryByLabelText('SCHEDULERS.ACTIONS.REMOVE')).toBeNull();
});

it('sends the edited schedule and keeps the scheduler it belongs to', async () => {
  const updateJobScheduler = jest.fn(() => Promise.resolve());
  renderPage({ api: { updateJobScheduler } });

  fireEvent.click(await screen.findByLabelText('SCHEDULERS.ACTIONS.EDIT'));

  const pattern = await screen.findByLabelText('SCHEDULERS.EDIT.PATTERN');
  fireEvent.change(pattern, { target: { value: '0 5 * * *' } });
  fireEvent.submit(pattern.closest('form') as HTMLFormElement);

  await waitFor(() =>
    expect(updateJobScheduler).toHaveBeenCalledWith('reports', 'daily-report', {
      pattern: '0 5 * * *',
    })
  );
});

it('keeps the edit form open when the server refuses the schedule', async () => {
  const updateJobScheduler = jest.fn(() =>
    Promise.resolve({ error: { key: 'ERRORS.INVALID_SCHEDULER_PATTERN' } })
  );
  renderPage({ api: { updateJobScheduler } });

  fireEvent.click(await screen.findByLabelText('SCHEDULERS.ACTIONS.EDIT'));

  const pattern = await screen.findByLabelText('SCHEDULERS.EDIT.PATTERN');
  fireEvent.change(pattern, { target: { value: 'not a cron' } });
  fireEvent.submit(pattern.closest('form') as HTMLFormElement);

  await waitFor(() => expect(updateJobScheduler).toHaveBeenCalled());
  // The refused value is still there to correct.
  expect((screen.getByLabelText('SCHEDULERS.EDIT.PATTERN') as HTMLInputElement).value).toBe(
    'not a cron'
  );
});

it('shows the last run only when the scheduler has one', async () => {
  renderPage({
    schedulers: [
      makeScheduler({ id: 'has-run', lastRun: Date.now() - 60_000 }),
      makeScheduler({ id: 'never-ran', iterationCount: 1 }),
    ],
  });

  await screen.findByText('has-run');

  const [hasRun, neverRan] = screen.getAllByRole('row').slice(1);
  // A scheduler that has not fired yet leaves the last run cell empty.
  expect(within(hasRun).queryByText('-')).toBeNull();
  expect(within(neverRan).getByText('-')).toBeTruthy();
});
