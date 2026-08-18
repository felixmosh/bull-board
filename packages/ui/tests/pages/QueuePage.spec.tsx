import type { AppQueue } from '@bull-board/api/typings/app';
import type { GetQueuesResponse } from '@bull-board/api/typings/responses';
import { waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { useSettingsStore } from '../../src/hooks/useSettings';
import { QueuePage } from '../../src/pages/QueuePage/QueuePage';
import { createWrapper, makeQueue, render } from '../testUtils';

jest.mock('../../src/utils/highlight/highlight', () => ({
  asyncHighlight: async (code: string) => code,
}));

beforeEach(() => {
  useSettingsStore.setState({ pollingInterval: 0, jobsPerPage: 10 });
});

function renderPage(overrides: Partial<AppQueue> = {}) {
  const queues = [makeQueue('reports', { jobSchedulerCount: 2, ...overrides })];
  const getQueues = jest.fn(() => Promise.resolve<GetQueuesResponse>({ queues }));
  const { Wrapper } = createWrapper({
    api: { getQueues },
    history: createMemoryHistory({ initialEntries: ['/queue/reports'] }),
  });

  const { container } = render(<QueuePage />, { wrapper: Wrapper });

  const schedulersLink = () => container.querySelector('a[href*="/job-schedulers"]');

  return { container, schedulersLink };
}

it('renders the schedulers link in the status tab row', async () => {
  const { container, schedulersLink } = renderPage();

  await waitFor(() => expect(schedulersLink()).toBeTruthy());
  expect(container.querySelector('.statusBar a[href*="/job-schedulers"]')).toBeTruthy();
  expect(container.querySelector('.actionContainer a[href*="/job-schedulers"]')).toBeNull();
});

it('keeps the schedulers link on a read only queue', async () => {
  const { schedulersLink } = renderPage({ readOnlyMode: true });

  await waitFor(() => expect(schedulersLink()).toBeTruthy());
});
