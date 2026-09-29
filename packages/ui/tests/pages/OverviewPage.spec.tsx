import type { GetQueuesResponse } from '@bull-board/api/typings/responses';
import { waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { queryKeys } from '../../src/hooks/queryKeys';
import { useSettingsStore } from '../../src/hooks/useSettings';
import { OverviewPage } from '../../src/pages/OverviewPage/OverviewPage';
import { createWrapper, makeQueue, render } from '../testUtils';

beforeEach(() => {
  useSettingsStore.setState({ pollingInterval: 0, jobsPerPage: 10 });
});

async function renderOverview(count: number) {
  const queues = Array.from({ length: count }, (_, index) => makeQueue(`queue-${index}`));
  const getQueues = jest.fn(() => Promise.resolve<GetQueuesResponse>({ queues }));
  const { Wrapper, queryClient } = createWrapper({
    api: { getQueues },
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });

  const { container } = render(<OverviewPage />, { wrapper: Wrapper });

  await waitFor(() => expect(container.querySelectorAll('.queueCard').length).toBe(count));

  return queryClient
    .getQueryCache()
    .find({ queryKey: queryKeys.queues.all, exact: false })
    ?.getObserversCount();
}

it('queue cards do not observe the queues query', async () => {
  const observersFor5 = await renderOverview(5);
  const observersFor50 = await renderOverview(50);

  expect(observersFor5).toBeGreaterThan(0);
  expect(observersFor50).toBe(observersFor5);
});
