import type { GetSearchStatusResponse } from '@bull-board/api/typings/responses';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchIndexModal } from '../../src/components/SearchIndexModal/SearchIndexModal';
import { createWrapper, MockApi, render } from '../testUtils';

function renderModal(status: GetSearchStatusResponse, api: MockApi = {}, canCheckCoverage = true) {
  const { Wrapper } = createWrapper({ api });
  return render(
    <SearchIndexModal
      open
      onClose={() => {}}
      queueName="orders"
      fields={['data.tenantId']}
      totalJobs={40}
      status={status}
      canCheckCoverage={canCheckCoverage}
    />,
    { wrapper: Wrapper }
  );
}

it('shows only the rows the provider reported', async () => {
  renderModal({ health: 'ok', reasons: [], indexedJobs: 5 });

  expect(await screen.findByText('QUEUE.SEARCH.INDEX.INDEXED_JOBS')).toBeTruthy();
  expect(screen.getByText('QUEUE.SEARCH.INDEX.INDEXED_OF_TOTAL')).toBeTruthy();
  expect(screen.queryByText('QUEUE.SEARCH.INDEX.PENDING_RETRIES')).toBeNull();
  expect(screen.queryByText('QUEUE.SEARCH.INDEX.LAST_SWEEP')).toBeNull();
  expect(screen.queryByText('QUEUE.SEARCH.INDEX.LAST_BACKFILL')).toBeNull();
});

it('checks coverage and links the missing jobs', async () => {
  const getSearchCoverage = jest.fn(() => Promise.resolve({ checked: 200, missing: ['7', 'a b'] }));
  renderModal({ health: 'ok', reasons: [] }, { getSearchCoverage });

  await userEvent.click(
    await screen.findByRole('button', { name: 'QUEUE.SEARCH.INDEX.CHECK_COVERAGE' })
  );

  await waitFor(() => expect(getSearchCoverage).toHaveBeenCalledWith('orders', 200));
  const first = await screen.findByRole('link', { name: '7' });
  expect(first.getAttribute('href')).toBe('/queue/orders/7');
  expect(screen.getByRole('link', { name: 'a b' }).getAttribute('href')).toBe(
    '/queue/orders/a%20b'
  );
});

it('offers no coverage check when the provider cannot run one', async () => {
  renderModal({ health: 'ok', reasons: [] }, {}, false);

  await screen.findByText('QUEUE.SEARCH.INDEX.TITLE');
  expect(screen.queryByRole('button', { name: 'QUEUE.SEARCH.INDEX.CHECK_COVERAGE' })).toBeNull();
});
