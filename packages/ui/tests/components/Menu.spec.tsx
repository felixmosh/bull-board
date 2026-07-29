import type { GetQueuesResponse } from '@bull-board/api/typings/responses';
import { screen, waitFor } from '@testing-library/react';
import { Menu } from '../../src/components/Menu/Menu';
import { useSettingsStore } from '../../src/hooks/useSettings';
import { createWrapper, render, makeQueue } from '../testUtils';

beforeEach(() => {
  useSettingsStore.setState({
    pollingInterval: 0,
    jobsPerPage: 10,
    confirmQueueActions: false,
    sortQueues: false,
    sidebarCollapsed: false,
  });
});

function renderMenu(hasHistoryProvider: boolean | undefined, jobSchedulerCount = 0) {
  const getQueues = jest.fn(() =>
    Promise.resolve<GetQueuesResponse>({ queues: [makeQueue('test', { jobSchedulerCount })] })
  );

  const api = { getQueues };
  const { Wrapper } = createWrapper({
    api,
    uiConfig: hasHistoryProvider === undefined ? {} : { hasHistoryProvider },
  });
  render(<Menu />, { wrapper: Wrapper });
  return api;
}

it('renders the metrics-history nav link when hasHistoryProvider is true', async () => {
  renderMenu(true);

  const link = await screen.findByText('MENU.METRICS_HISTORY');
  expect(link.getAttribute('href')).toContain('metrics-history');
});

it('does not render the metrics-history nav link when hasHistoryProvider is false', async () => {
  renderMenu(false);

  // Wait for the queues list to settle so we're not just observing a pre-render gap.
  await waitFor(() => expect(screen.getByText('MENU.QUEUES')).toBeTruthy());
  expect(screen.queryByText('MENU.METRICS_HISTORY')).toBeNull();
});

it('does not render the metrics-history nav link when hasHistoryProvider is undefined', async () => {
  renderMenu(undefined);

  await waitFor(() => expect(screen.getByText('MENU.QUEUES')).toBeTruthy());
  expect(screen.queryByText('MENU.METRICS_HISTORY')).toBeNull();
});

it('renders the schedulers nav link once a queue has a scheduler', async () => {
  renderMenu(false, 2);

  const link = await screen.findByText('MENU.SCHEDULERS');
  expect(link.getAttribute('href')).toContain('job-schedulers');
});

it('does not render the schedulers nav link when nothing is scheduled', async () => {
  renderMenu(false, 0);

  expect(screen.queryByText('MENU.SCHEDULERS')).toBeNull();
});
