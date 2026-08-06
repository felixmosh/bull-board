import type { UIConfig } from '@bull-board/api/typings/app';
import type { GetQueuesResponse } from '@bull-board/api/typings/responses';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { MobileQueueDropdown } from '../../src/components/Header/MobileQueueDropdown/MobileQueueDropdown';
import { useSettingsStore } from '../../src/hooks/useSettings';
import { createWrapper, makeQueue, render } from '../testUtils';

beforeEach(() => {
  useSettingsStore.setState({ pollingInterval: 0, jobsPerPage: 10 });
});

/**
 * The sidebar is display:none at this width, so anything it links to is reachable only from
 * this dropdown. These cover the nav entries; the queue list itself predates them.
 */
async function openDropdown({
  uiConfig = {},
  jobSchedulerCount = 0,
  path = '/',
}: { uiConfig?: UIConfig; jobSchedulerCount?: number; path?: string } = {}) {
  const getQueues = jest.fn(() =>
    Promise.resolve<GetQueuesResponse>({ queues: [makeQueue('test', { jobSchedulerCount })] })
  );
  const history = createMemoryHistory({ initialEntries: [path] });
  const { Wrapper } = createWrapper({ api: { getQueues }, history, uiConfig });

  render(<MobileQueueDropdown />, { wrapper: Wrapper });
  await waitFor(() => expect(getQueues).toHaveBeenCalled());
  fireEvent.click(screen.getAllByRole('button')[0]);
  await waitFor(() => expect(screen.getByRole('menu')).toBeTruthy());

  return { history };
}

it('offers the metrics-history page when a history provider is configured', async () => {
  const { history } = await openDropdown({ uiConfig: { hasHistoryProvider: true } });

  fireEvent.click(screen.getByText('MENU.METRICS_HISTORY'));

  expect(history.location.pathname).toBe('/metrics-history');
});

it('omits the metrics-history page without a history provider', async () => {
  await openDropdown();

  expect(screen.queryByText('MENU.METRICS_HISTORY')).toBeNull();
});

it('offers the schedulers page once a queue has a scheduler', async () => {
  const { history } = await openDropdown({ jobSchedulerCount: 2 });

  fireEvent.click(screen.getByText('MENU.SCHEDULERS'));

  expect(history.location.pathname).toBe('/job-schedulers');
});

it('omits the schedulers page when nothing is scheduled', async () => {
  await openDropdown();

  expect(screen.queryByText('MENU.SCHEDULERS')).toBeNull();
});

it('names the current page on the trigger when it is not a queue', async () => {
  await openDropdown({ uiConfig: { hasHistoryProvider: true }, path: '/metrics-history' });

  expect(screen.getAllByRole('button')[0].textContent).toBe('MENU.METRICS_HISTORY');
});

it('falls back to the overview label on the trigger', async () => {
  await openDropdown();

  expect(screen.getAllByRole('button')[0].textContent).toBe('MENU.OVERVIEW');
});
