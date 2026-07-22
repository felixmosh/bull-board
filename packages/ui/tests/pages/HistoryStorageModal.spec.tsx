import type { UIConfig } from '@bull-board/api/typings/app';
import type { GetMetricsHistoryUsageResponse } from '@bull-board/api/typings/responses';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import i18n from 'i18next';
import { ConfirmModal } from '../../src/components/ConfirmModal/ConfirmModal';
import { useConfirm } from '../../src/hooks/useConfirm';
import { HistoryStorageModal } from '../../src/pages/MetricsHistoryPage/HistoryStorageModal';
import enUS from '../../src/static/locales/en-US/messages.json';
import { createWrapper, render } from '../testUtils';

// The rest of the suite runs in i18n `cimode`, where t(key) returns the key. The whole
// point of this panel is that it warns the user in words before deleting anything, so
// this spec loads the real English strings and asserts what a user would actually read.
beforeAll(async () => {
  i18n.addResourceBundle('en', 'translation', enUS, true, true);
  await i18n.changeLanguage('en');
});

const emptyTier = () => ({ keys: 0, bytes: 0 });

const USAGE: GetMetricsHistoryUsageResponse = {
  keys: 6,
  bytes: 1_500_000,
  minutes: 2880,
  oldestDay: '2026-05-01',
  newestDay: '2026-07-20',
  tiers: {
    minute: { keys: 2, bytes: 1_400_000 },
    hour: { keys: 2, bytes: 60_000 },
    day: { keys: 2, bytes: 40_000 },
  },
  queues: [
    {
      queue: 'mailer',
      keys: 3,
      bytes: 1_000_000,
      minutes: 2000,
      days: ['2026-05-01'],
      tiers: { minute: emptyTier(), hour: emptyTier(), day: emptyTier() },
    },
    {
      queue: '__global__',
      keys: 3,
      bytes: 500_000,
      minutes: 880,
      days: ['2026-05-01'],
      tiers: { minute: emptyTier(), hour: emptyTier(), day: emptyTier() },
    },
  ],
};

// The confirm dialog lives in a global store rendered by the app shell, so the modal is
// wrapped with it here exactly as the real page hierarchy does.
const Harness = ({ open = true }: { open?: boolean }) => {
  const { confirmProps } = useConfirm();
  return (
    <>
      <HistoryStorageModal
        open={open}
        from={Date.UTC(2026, 6, 14)}
        rangeLabel="7d"
        onClose={() => {}}
      />
      <ConfirmModal {...confirmProps} />
    </>
  );
};

function renderPanel(
  uiConfig: UIConfig,
  api: { getHistoryUsage?: jest.Mock; purgeHistory?: jest.Mock } = {},
  open = true
) {
  const getHistoryUsage = api.getHistoryUsage ?? jest.fn(() => Promise.resolve(USAGE));
  const purgeHistory =
    api.purgeHistory ?? jest.fn(() => Promise.resolve({ keysDeleted: 4, fieldsDeleted: 2 }));
  const { Wrapper } = createWrapper({ api: { getHistoryUsage, purgeHistory }, uiConfig });
  render(<Harness open={open} />, { wrapper: Wrapper });
  return { getHistoryUsage, purgeHistory };
}

// The modal mounts already open in these specs, so there is nothing to click first.
const openPanel = async () => {};

it('does not fetch usage while closed', async () => {
  const { getHistoryUsage } = renderPanel({ hasHistoryUsage: true }, {}, false);

  await waitFor(() => expect(getHistoryUsage).not.toHaveBeenCalled());
});

it('fetches usage once opened', async () => {
  const { getHistoryUsage } = renderPanel({ hasHistoryUsage: true });

  await waitFor(() => expect(getHistoryUsage).toHaveBeenCalledTimes(1));
});

it('breaks the footprint down by tier so a large minute tier is visible', async () => {
  renderPanel({ hasHistoryUsage: true });
  await openPanel();

  const minuteTier = await screen.findByText('Minute detail');
  expect(minuteTier.parentElement?.textContent).toContain('1.4 MB');

  expect(screen.getByText('Hourly').parentElement?.textContent).toContain('60.0 kB');
  expect(screen.getByText('Daily totals').parentElement?.textContent).toContain('40.0 kB');
});

it('lists each queue with its size', async () => {
  renderPanel({ hasHistoryUsage: true });
  await openPanel();

  const row = (await screen.findByText('mailer')).closest('tr')!;
  expect(within(row).getByText('1.0 MB')).toBeTruthy();
  expect(within(row).getByText('2,000')).toBeTruthy();
});

it('hides the destructive actions when purging is not permitted', async () => {
  renderPanel({ hasHistoryUsage: true });
  await openPanel();

  await screen.findByText('Minute detail');
  expect(screen.queryByRole('button', { name: /clear all history/i })).toBeNull();
  expect(screen.queryByRole('button', { name: /keep only/i })).toBeNull();
});

describe('purging', () => {
  const uiConfig: UIConfig = { hasHistoryUsage: true, canPurgeHistory: true };

  it('asks for confirmation and states the size before clearing everything', async () => {
    const { purgeHistory } = renderPanel(uiConfig);
    await openPanel();

    fireEvent.click(await screen.findByRole('button', { name: /clear all history/i }));

    expect(await screen.findByText(/Delete recorded metrics history\?/)).toBeTruthy();
    expect(screen.getByText(/All 1.5 MB of recorded history will be deleted/)).toBeTruthy();
    expect(purgeHistory).not.toHaveBeenCalled();

    // The confirm dialog is backed by a module-level store, so leaving it open would
    // keep the next test's tree hidden behind the modal's backdrop.
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
  });

  it('does not purge when the confirmation is cancelled', async () => {
    const { purgeHistory } = renderPanel(uiConfig);
    await openPanel();

    fireEvent.click(await screen.findByRole('button', { name: /clear all history/i }));
    fireEvent.click(await screen.findByRole('button', { name: /cancel/i }));

    await waitFor(() => expect(screen.queryByText(/Delete recorded metrics history\?/)).toBeNull());
    expect(purgeHistory).not.toHaveBeenCalled();
  });

  it('purges everything once confirmed', async () => {
    const { purgeHistory } = renderPanel(uiConfig);
    await openPanel();

    fireEvent.click(await screen.findByRole('button', { name: /clear all history/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^confirm$/i }));

    await waitFor(() => expect(purgeHistory).toHaveBeenCalledWith({}));
  });

  it('sends the range start as the cutoff when trimming, and says which days go', async () => {
    const { purgeHistory } = renderPanel(uiConfig);
    await openPanel();

    fireEvent.click(await screen.findByRole('button', { name: /keep only the last 7d/i }));

    expect(screen.getByText(/Everything recorded before 2026-07-14 will be deleted/)).toBeTruthy();

    fireEvent.click(await screen.findByRole('button', { name: /^confirm$/i }));

    await waitFor(() => expect(purgeHistory).toHaveBeenCalledWith({ before: '2026-07-14' }));
  });

  it('refetches usage after a purge so the panel cannot show stale numbers', async () => {
    const { getHistoryUsage, purgeHistory } = renderPanel(uiConfig);
    await openPanel();
    await waitFor(() => expect(getHistoryUsage).toHaveBeenCalledTimes(1));

    fireEvent.click(await screen.findByRole('button', { name: /clear all history/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^confirm$/i }));

    await waitFor(() => expect(purgeHistory).toHaveBeenCalled());
    await waitFor(() => expect(getHistoryUsage).toHaveBeenCalledTimes(2));
  });

  it('disables trimming when nothing predates the visible range', async () => {
    const getHistoryUsage = jest.fn(() =>
      Promise.resolve({ ...USAGE, oldestDay: '2026-07-20', newestDay: '2026-07-20' })
    );
    renderPanel(uiConfig, { getHistoryUsage });
    await openPanel();

    const trim = await screen.findByRole('button', { name: /keep only the last 7d/i });
    expect((trim as HTMLButtonElement).disabled).toBe(true);
    // Clearing everything stays available: there is data, it is just all recent.
    expect(
      (screen.getByRole('button', { name: /clear all history/i }) as HTMLButtonElement).disabled
    ).toBe(false);
  });

  it('shows an empty state and no actions when nothing is stored', async () => {
    const getHistoryUsage = jest.fn(() =>
      Promise.resolve({
        keys: 0,
        bytes: 0,
        minutes: 0,
        oldestDay: null,
        newestDay: null,
        tiers: { minute: emptyTier(), hour: emptyTier(), day: emptyTier() },
        queues: [],
      })
    );
    renderPanel(uiConfig, { getHistoryUsage });
    await openPanel();

    expect(await screen.findByText('Nothing stored yet.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /clear all history/i })).toBeNull();
  });
});
