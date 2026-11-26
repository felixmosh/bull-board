import type { GetSearchStatusResponse } from '@bull-board/api/typings/responses';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { SearchIndexModal } from '../../src/components/SearchIndexModal/SearchIndexModal';
import enUS from '../../src/static/locales/en-US/messages.json';
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

it('pluralizes the backfill and sweep details and keeps a fast backfill above zero', async () => {
  const i18n = createInstance();
  await i18n.init({
    lng: 'en-US',
    resources: { 'en-US': { translation: enUS } },
    interpolation: { escapeValue: false },
  });
  const { Wrapper } = createWrapper({ api: {} });
  render(
    <I18nextProvider i18n={i18n}>
      <SearchIndexModal
        open
        onClose={() => {}}
        queueName="orders"
        fields={['data.tenantId']}
        totalJobs={40}
        status={{
          health: 'ok',
          reasons: [],
          lastBackfill: { finishedAt: Date.now(), jobs: 1, durationMs: 420 },
          lastSweep: { finishedAt: Date.now(), checked: 1, removed: 3 },
        }}
        canCheckCoverage={false}
      />
    </I18nextProvider>,
    { wrapper: Wrapper }
  );

  expect(await screen.findByText('1 job in 0.4 s')).toBeTruthy();
  expect(screen.getByText('1 checked, 3 removed')).toBeTruthy();
});
