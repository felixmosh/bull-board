import type { QueueWorker } from '@bull-board/api/typings/app';
import type { GetQueueWorkersResponse } from '@bull-board/api/typings/responses';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { QueueInfoModal } from '../../src/components/QueueInfoModal/QueueInfoModal';
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

function renderInfo(
  workers: GetQueueWorkersResponse['workers'],
  { showWorkers = true, open = true } = {}
) {
  const api = {
    getQueueWorkers: jest.fn(() => Promise.resolve({ workers })),
    getQueueDefaultJobOptions: jest.fn(() => Promise.resolve({})),
  };
  const { Wrapper } = createWrapper({ api, uiConfig: { showWorkers } });
  render(
    <QueueInfoModal open={open} queue={makeQueue('Search.IndexUpdate')} onClose={() => {}} />,
    {
      wrapper: Wrapper,
    }
  );
  return api;
}

// The overview cards hide the badge while a queue is healthy, so the info panel is where
// the worker details stay reachable whether or not anything is wrong.
describe('QueueInfoModal workers', () => {
  it('reports the count alongside the other queue facts', async () => {
    renderInfo([worker(), worker({ id: '43' })]);

    await waitFor(() => expect(screen.getByText('QUEUE.INFO.WORKERS')).toBeTruthy());
    expect(screen.getByText('2')).toBeTruthy();
  });

  // The modal opens on Overview, and the sections unmount what they are hiding, so the rows
  // only exist once Workers is actually expanded.
  it('lists the connection details in its own section', async () => {
    renderInfo([worker({ name: 'crunch-1' })]);

    await waitFor(() => expect(screen.getByText('QUEUE.WORKERS.TITLE')).toBeTruthy());
    fireEvent.click(screen.getByText('QUEUE.WORKERS.TITLE'));

    expect(await screen.findByText('crunch-1')).toBeTruthy();
    expect(screen.getByText('172.20.0.1:55486')).toBeTruthy();
  });

  // One request per opening, not one per polling interval: the list is only on screen while
  // the panel is, and the board gets its warning from the queue listing instead.
  it('asks for the list once, for the queue it is showing', async () => {
    const api = renderInfo([worker()]);

    await waitFor(() => expect(screen.getByText('QUEUE.WORKERS.TITLE')).toBeTruthy());
    expect(api.getQueueWorkers).toHaveBeenCalledTimes(1);
    expect(api.getQueueWorkers).toHaveBeenCalledWith('Search.IndexUpdate');
  });

  it('asks for nothing while the panel is closed', async () => {
    const api = renderInfo([worker()], { open: false });

    await waitFor(() => expect(screen.queryByText('QUEUE.WORKERS.TITLE')).toBeNull());
    expect(api.getQueueWorkers).not.toHaveBeenCalled();
  });

  it('says nothing about workers when the queue cannot report them', async () => {
    renderInfo(null);

    await waitFor(() => expect(screen.getByText('QUEUE.INFO.OVERVIEW')).toBeTruthy());
    expect(screen.queryByText('QUEUE.INFO.WORKERS')).toBeNull();
    expect(screen.queryByText('QUEUE.WORKERS.TITLE')).toBeNull();
  });

  it('says nothing about workers when the board opted out', async () => {
    const api = renderInfo([worker()], { showWorkers: false });

    await waitFor(() => expect(screen.getByText('QUEUE.INFO.OVERVIEW')).toBeTruthy());
    expect(api.getQueueWorkers).not.toHaveBeenCalled();
    expect(screen.queryByText('QUEUE.WORKERS.TITLE')).toBeNull();
  });
});
