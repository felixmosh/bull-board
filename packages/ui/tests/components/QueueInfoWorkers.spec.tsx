import type { QueueWorker } from '@bull-board/api/typings/app';
import type { GetQueueWorkersResponse } from '@bull-board/api/typings/responses';
import { screen, waitFor } from '@testing-library/react';
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

async function renderInfo(
  workers: GetQueueWorkersResponse['workers'],
  { showWorkers = true } = {}
) {
  const api = {
    getQueueWorkers: jest.fn(() => Promise.resolve({ workers })),
    getQueueDefaultJobOptions: jest.fn(() => Promise.resolve({})),
  };
  const { Wrapper } = createWrapper({ api, uiConfig: { showWorkers } });
  render(<QueueInfoModal open queue={makeQueue('Search.IndexUpdate')} onClose={() => {}} />, {
    wrapper: Wrapper,
  });
  return api;
}

// The overview cards hide the badge while a queue is healthy, so the info panel is where
// the worker details stay reachable whether or not anything is wrong.
describe('QueueInfoModal workers', () => {
  it('reports the count alongside the other queue facts', async () => {
    await renderInfo({ 'Search.IndexUpdate': [worker(), worker({ id: '43' })] });

    await waitFor(() => expect(screen.getByText('QUEUE.INFO.WORKERS')).toBeTruthy());
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('lists the connection details in its own section', async () => {
    await renderInfo({ 'Search.IndexUpdate': [worker({ name: 'crunch-1' })] });

    await waitFor(() => expect(screen.getByText('QUEUE.WORKERS.TITLE')).toBeTruthy());
    expect(screen.getByText('crunch-1')).toBeTruthy();
    expect(screen.getByText('172.20.0.1:55486')).toBeTruthy();
  });

  it('says nothing about workers when the queue cannot report them', async () => {
    await renderInfo({ 'Search.IndexUpdate': null });

    await waitFor(() => expect(screen.getByText('QUEUE.INFO.OVERVIEW')).toBeTruthy());
    expect(screen.queryByText('QUEUE.INFO.WORKERS')).toBeNull();
    expect(screen.queryByText('QUEUE.WORKERS.TITLE')).toBeNull();
  });

  it('says nothing about workers when the board opted out', async () => {
    const api = await renderInfo({}, { showWorkers: false });

    await waitFor(() => expect(screen.getByText('QUEUE.INFO.OVERVIEW')).toBeTruthy());
    expect(api.getQueueWorkers).not.toHaveBeenCalled();
    expect(screen.queryByText('QUEUE.WORKERS.TITLE')).toBeNull();
  });
});
