import type { AppQueue } from '@bull-board/api/typings/app';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { QueueInfoModal } from '../../src/components/QueueInfoModal/QueueInfoModal';
import { useSettingsStore } from '../../src/hooks/useSettings';
import { createWrapper, makeQueue, render } from '../testUtils';

beforeEach(() => {
  useSettingsStore.setState({ pollingInterval: 0 });
});

function renderInfo(overrides: Partial<AppQueue> = {}) {
  const queue = makeQueue('Emails.Welcome', overrides);
  const api = {
    getQueues: jest.fn(() => Promise.resolve({ queues: [queue] })),
    getQueueWorkers: jest.fn(() => Promise.resolve({ workers: null })),
    getQueueDefaultJobOptions: jest.fn(() => Promise.resolve({})),
    getQueueRateLimit: jest.fn(() =>
      Promise.resolve({ supported: true, rateLimit: { max: 500, duration: 60_000 } })
    ),
  };
  const { Wrapper } = createWrapper({ api });
  render(<QueueInfoModal open queue={queue} onClose={() => {}} />, { wrapper: Wrapper });
  return api;
}

describe('QueueInfoModal edit actions', () => {
  it('opens the concurrency dialog from the row showing the value', async () => {
    renderInfo();

    fireEvent.click(await screen.findByLabelText('QUEUE.ACTIONS.SET_CONCURRENCY'));

    expect(await screen.findByText('CONCURRENCY.DESCRIPTION')).toBeTruthy();
  });

  it('opens the rate limit dialog from the row showing the value', async () => {
    renderInfo();

    fireEvent.click(await screen.findByLabelText('QUEUE.ACTIONS.SET_RATE_LIMIT'));

    expect(await screen.findByText('RATE_LIMIT.DESCRIPTION')).toBeTruthy();
  });

  it('offers neither on a read-only queue', async () => {
    renderInfo({ readOnlyMode: true });

    await waitFor(() => expect(screen.getByText('QUEUE.INFO.OVERVIEW')).toBeTruthy());
    expect(screen.queryByLabelText('QUEUE.ACTIONS.SET_CONCURRENCY')).toBeNull();
    expect(screen.queryByLabelText('QUEUE.ACTIONS.SET_RATE_LIMIT')).toBeNull();
  });

  it('offers neither on a Bull queue', async () => {
    renderInfo({ type: 'bull', supportsGlobalRateLimit: false });

    await waitFor(() => expect(screen.getByText('QUEUE.INFO.OVERVIEW')).toBeTruthy());
    expect(screen.queryByLabelText('QUEUE.ACTIONS.SET_CONCURRENCY')).toBeNull();
    expect(screen.queryByLabelText('QUEUE.ACTIONS.SET_RATE_LIMIT')).toBeNull();
  });
});
