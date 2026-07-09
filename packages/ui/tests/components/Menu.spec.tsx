import type { GetQueuesResponse } from '@bull-board/api/typings/responses';
import { screen, waitFor } from '@testing-library/react';
import { Menu } from '../../src/components/Menu/Menu';
import { useSettingsStore } from '../../src/hooks/useSettings';
import { createWrapper, render } from '../testUtils';

beforeEach(() => {
  useSettingsStore.setState({
    pollingInterval: 0,
    jobsPerPage: 10,
    confirmQueueActions: false,
    sortQueues: false,
    sidebarCollapsed: false,
  });
});

function renderMenu(hasHistoryProvider: boolean | undefined) {
  const getQueues = jest.fn(() => Promise.resolve<GetQueuesResponse>({ queues: [] }));
  const api = { getQueues };
  const { Wrapper } = createWrapper({
    api,
    uiConfig: hasHistoryProvider === undefined ? {} : { hasHistoryProvider },
  });
  render(<Menu />, { wrapper: Wrapper });
  return { getQueues };
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
