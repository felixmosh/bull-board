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
    offscreen = [],
  }: { queues?: AppQueue[]; uiConfig?: UIConfig; offscreen?: string[] } = {}
) {
  const api = {
    getQueuesHasWorkers: jest.fn(() => Promise.resolve({ hasWorkers })),
    getQueueWorkers: jest.fn(() => Promise.resolve({ workers: [] })),
    getQueueDefaultJobOptions: jest.fn(() => Promise.resolve({})),
  };
  const { Wrapper } = createWrapper({ api, uiConfig });
  render(
    <>
      {queues.map((queue) => (
        <WorkersBadge key={queue.name} queue={queue} enabled={!offscreen.includes(queue.name)} />
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
    expect(badge.getAttribute('aria-label')).toBe('QUEUE.WORKERS.NONE. QUEUE.WORKERS.NONE_TOOLTIP');
  });

  it('asks about every badge on the page in one request', async () => {
    const api = renderBadges(
      { Idle: false, Busy: true, Other: false },
      { queues: [makeQueue('Idle'), makeQueue('Busy'), makeQueue('Other')] }
    );

    await waitFor(() => expect(screen.getAllByRole('button')).toHaveLength(2));
    expect(api.getQueuesHasWorkers).toHaveBeenCalledTimes(1);
    expect(api.getQueuesHasWorkers).toHaveBeenCalledWith(['Idle', 'Busy', 'Other']);
    expect(api.getQueueWorkers).not.toHaveBeenCalled();
  });

  it('leaves a badge that is out of view out of the request', async () => {
    const api = renderBadges(
      { Idle: false },
      { queues: [makeQueue('Idle'), makeQueue('Offscreen')], offscreen: ['Offscreen'] }
    );

    await screen.findByRole('button');
    expect(api.getQueuesHasWorkers).toHaveBeenCalledTimes(1);
    expect(api.getQueuesHasWorkers).toHaveBeenCalledWith(['Idle']);
  });

  it('asks nothing of the api when the board opted out', async () => {
    const api = renderBadges({ 'Search.IndexUpdate': false }, { uiConfig: { showWorkers: false } });

    await waitFor(() => expect(screen.queryByRole('button')).toBeNull());
    expect(api.getQueuesHasWorkers).not.toHaveBeenCalled();
  });

  it('stays hidden while the queue has workers', async () => {
    const api = renderBadges({ 'Search.IndexUpdate': true });

    await waitFor(() => expect(api.getQueuesHasWorkers).toHaveBeenCalled());
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('stays hidden for a paused queue with no workers', async () => {
    const api = renderBadges(
      { 'Search.IndexUpdate': false },
      { queues: [makeQueue('Search.IndexUpdate', { isPaused: true })] }
    );

    await waitFor(() => expect(api.getQueuesHasWorkers).toHaveBeenCalled());
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('stays hidden when the queue cannot report its workers', async () => {
    const api = renderBadges({ 'Search.IndexUpdate': null });

    await waitFor(() => expect(api.getQueuesHasWorkers).toHaveBeenCalled());
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
