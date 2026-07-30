import type { QueueWorker } from '@bull-board/api/typings/app';
import type { GetQueueWorkersResponse } from '@bull-board/api/typings/responses';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { WorkersBadge } from '../../src/components/WorkersBadge/WorkersBadge';
import { useSettingsStore } from '../../src/hooks/useSettings';
import { createWrapper, makeQueue, render } from '../testUtils';

beforeEach(() => {
  useSettingsStore.setState({ pollingInterval: 0 });
});

const worker = (overrides: Partial<QueueWorker> = {}): QueueWorker => ({
  id: '42',
  name: null,
  addr: '172.20.0.1:55486',
  age: 90,
  ...overrides,
});

async function renderBadge(
  workers: GetQueueWorkersResponse['workers'],
  queueOverrides: Parameters<typeof makeQueue>[1] = {}
) {
  const api = {
    getQueueWorkers: jest.fn(() => Promise.resolve({ workers })),
    getQueueDefaultJobOptions: jest.fn(() => Promise.resolve({})),
  };
  const { Wrapper } = createWrapper({ api });
  render(<WorkersBadge queue={makeQueue('Search.IndexUpdate', queueOverrides)} />, {
    wrapper: Wrapper,
  });
  await waitFor(() => expect(api.getQueueWorkers).toHaveBeenCalled());
  return api;
}

// The badge exists to flag one situation. Anything else on the page would be real estate
// spent on a number you never need to act on, so the count lives in the info panel instead.
describe('WorkersBadge', () => {
  it('warns when nothing is consuming the queue', async () => {
    await renderBadge({ 'Search.IndexUpdate': [] });

    const badge = await screen.findByRole('button');
    expect(badge.textContent).toBe('QUEUE.WORKERS.NONE');
    expect(badge.getAttribute('aria-label')).toBe('QUEUE.WORKERS.NONE_TOOLTIP');
  });

  it('stays hidden while the queue has workers', async () => {
    await renderBadge({ 'Search.IndexUpdate': [worker(), worker({ id: '43' })] });

    await waitFor(() => expect(screen.queryByRole('button')).toBeNull());
  });

  // A paused queue is supposed to have nothing consuming it.
  it('stays hidden for a paused queue with no workers', async () => {
    await renderBadge({ 'Search.IndexUpdate': [] }, { isPaused: true });

    await waitFor(() => expect(screen.queryByRole('button')).toBeNull());
  });

  it('stays hidden when the queue cannot report its workers', async () => {
    await renderBadge({ 'Search.IndexUpdate': null });

    await waitFor(() => expect(screen.queryByRole('button')).toBeNull());
  });

  it('stays hidden for a queue missing from the response', async () => {
    await renderBadge({ Other: [worker()] });

    await waitFor(() => expect(screen.queryByRole('button')).toBeNull());
  });

  // One place owns the list: the badge opens the queue info panel on its workers section.
  it('opens the queue info panel on the workers section', async () => {
    await renderBadge({ 'Search.IndexUpdate': [] });

    fireEvent.click(await screen.findByRole('button'));

    await waitFor(() => expect(screen.getByText('QUEUE.INFO.TITLE')).toBeTruthy());
    expect(screen.getByText('QUEUE.WORKERS.EMPTY')).toBeTruthy();
  });

  it('does not request workers when the board opted out', async () => {
    const api = { getQueueWorkers: jest.fn(() => Promise.resolve({ workers: {} })) };
    const { Wrapper } = createWrapper({ api, uiConfig: { showWorkers: false } });
    render(<WorkersBadge queue={makeQueue('Search.IndexUpdate')} />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.queryByRole('button')).toBeNull());
    expect(api.getQueueWorkers).not.toHaveBeenCalled();
  });
});
