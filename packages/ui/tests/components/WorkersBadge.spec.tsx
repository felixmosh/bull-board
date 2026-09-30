import type { AppQueue, UIConfig } from '@bull-board/api/typings/app';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { WorkersBadge } from '../../src/components/WorkersBadge/WorkersBadge';
import { useSettingsStore } from '../../src/hooks/useSettings';
import { createWrapper, makeQueue, render } from '../testUtils';

beforeEach(() => {
  useSettingsStore.setState({ pollingInterval: 0 });
});

function renderBadges(
  hasWorkers: Record<string, boolean | null>,
  {
    queues = [makeQueue('Search.IndexUpdate')],
    uiConfig,
  }: { queues?: AppQueue[]; uiConfig?: UIConfig } = {}
) {
  const api = {
    getQueuesWorkers: jest.fn(() => Promise.resolve({ hasWorkers })),
    getQueueWorkers: jest.fn(() => Promise.resolve({ workers: [] })),
    getQueueDefaultJobOptions: jest.fn(() => Promise.resolve({})),
  };
  const { Wrapper } = createWrapper({ api, uiConfig });
  render(
    <>
      {queues.map((queue) => (
        <WorkersBadge key={queue.name} queue={queue} />
      ))}
    </>,
    { wrapper: Wrapper }
  );
  return api;
}

describe('WorkersBadge', () => {
  it('warns when nothing is consuming the queue', async () => {
    renderBadges({ 'Search.IndexUpdate': false });

    const badge = await screen.findByRole('button');
    expect(badge.textContent).toBe('QUEUE.WORKERS.NONE');
    expect(badge.getAttribute('aria-label')).toBe('QUEUE.WORKERS.NONE_TOOLTIP');
  });

  it('shares one board-wide request between every badge on the page', async () => {
    const api = renderBadges(
      { Idle: false, Busy: true, Other: false },
      { queues: [makeQueue('Idle'), makeQueue('Busy'), makeQueue('Other')] }
    );

    await waitFor(() => expect(screen.getAllByRole('button')).toHaveLength(2));
    expect(api.getQueuesWorkers).toHaveBeenCalledTimes(1);
    expect(api.getQueueWorkers).not.toHaveBeenCalled();
  });

  it('asks nothing of the api when the board opted out', async () => {
    const api = renderBadges({ 'Search.IndexUpdate': false }, { uiConfig: { showWorkers: false } });

    await waitFor(() => expect(screen.queryByRole('button')).toBeNull());
    expect(api.getQueuesWorkers).not.toHaveBeenCalled();
  });

  it('stays hidden while the queue has workers', async () => {
    const api = renderBadges({ 'Search.IndexUpdate': true });

    await waitFor(() => expect(api.getQueuesWorkers).toHaveBeenCalled());
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('stays hidden for a paused queue with no workers', async () => {
    const api = renderBadges(
      { 'Search.IndexUpdate': false },
      { queues: [makeQueue('Search.IndexUpdate', { isPaused: true })] }
    );

    await waitFor(() => expect(api.getQueuesWorkers).toHaveBeenCalled());
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('stays hidden when the queue cannot report its workers', async () => {
    const api = renderBadges({ 'Search.IndexUpdate': null });

    await waitFor(() => expect(api.getQueuesWorkers).toHaveBeenCalled());
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('opens the queue info panel on the workers section', async () => {
    const api = renderBadges({ 'Search.IndexUpdate': false });

    fireEvent.click(await screen.findByRole('button'));

    await waitFor(() => expect(screen.getByText('QUEUE.INFO.TITLE')).toBeTruthy());
    expect(screen.getByText('QUEUE.WORKERS.EMPTY')).toBeTruthy();
    expect(api.getQueueWorkers).toHaveBeenCalledWith('Search.IndexUpdate');
  });
});
