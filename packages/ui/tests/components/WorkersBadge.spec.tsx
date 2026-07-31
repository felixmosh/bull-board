import type { AppQueue } from '@bull-board/api/typings/app';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { WorkersBadge } from '../../src/components/WorkersBadge/WorkersBadge';
import { useSettingsStore } from '../../src/hooks/useSettings';
import { createWrapper, makeQueue, render } from '../testUtils';

beforeEach(() => {
  useSettingsStore.setState({ pollingInterval: 0 });
});

function renderBadge(queueOverrides: Partial<AppQueue> = {}) {
  const api = {
    getQueueWorkers: jest.fn(() => Promise.resolve({ workers: [] })),
    getQueueDefaultJobOptions: jest.fn(() => Promise.resolve({})),
  };
  const { Wrapper } = createWrapper({ api });
  render(<WorkersBadge queue={makeQueue('Search.IndexUpdate', queueOverrides)} />, {
    wrapper: Wrapper,
  });
  return api;
}

// The badge exists to flag one situation. Anything else on the page would be real estate
// spent on a number you never need to act on, so the count lives in the info panel instead.
describe('WorkersBadge', () => {
  it('warns when nothing is consuming the queue', async () => {
    renderBadge({ hasWorkers: false });

    const badge = await screen.findByRole('button');
    expect(badge.textContent).toBe('QUEUE.WORKERS.NONE');
    expect(badge.getAttribute('aria-label')).toBe('QUEUE.WORKERS.NONE_TOOLTIP');
  });

  // The flag rides along with the queue listing, so the warning costs no request of its own.
  it('asks nothing of the api to decide whether to warn', async () => {
    const api = renderBadge({ hasWorkers: false });

    await screen.findByRole('button');
    expect(api.getQueueWorkers).not.toHaveBeenCalled();
  });

  it('stays hidden while the queue has workers', async () => {
    renderBadge({ hasWorkers: true });

    await waitFor(() => expect(screen.queryByRole('button')).toBeNull());
  });

  // A paused queue is supposed to have nothing consuming it.
  it('stays hidden for a paused queue with no workers', async () => {
    renderBadge({ hasWorkers: false, isPaused: true });

    await waitFor(() => expect(screen.queryByRole('button')).toBeNull());
  });

  it('stays hidden when the queue cannot report its workers', async () => {
    renderBadge({ hasWorkers: null });

    await waitFor(() => expect(screen.queryByRole('button')).toBeNull());
  });

  // One place owns the list: the badge opens the queue info panel on its workers section.
  it('opens the queue info panel on the workers section', async () => {
    const api = renderBadge({ hasWorkers: false });

    fireEvent.click(await screen.findByRole('button'));

    await waitFor(() => expect(screen.getByText('QUEUE.INFO.TITLE')).toBeTruthy());
    expect(screen.getByText('QUEUE.WORKERS.EMPTY')).toBeTruthy();
    // Only now, once the panel that shows the list is open, is the list asked for.
    expect(api.getQueueWorkers).toHaveBeenCalledWith('Search.IndexUpdate');
  });
});
