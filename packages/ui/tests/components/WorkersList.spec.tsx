import type { QueueWorker } from '@bull-board/api/typings/app';
import { screen } from '@testing-library/react';
import { WorkersList } from '../../src/components/WorkersList/WorkersList';
import { createWrapper, render } from '../testUtils';

const worker = (overrides: Partial<QueueWorker> = {}): QueueWorker => ({
  id: '42',
  name: null,
  addr: '172.20.0.1:55486',
  age: 90,
  ...overrides,
});

function renderList(workers: QueueWorker[], isPaused = false) {
  const { Wrapper } = createWrapper({ api: {} });
  render(<WorkersList workers={workers} isPaused={isPaused} />, { wrapper: Wrapper });
}

describe('WorkersList', () => {
  it('leads with the worker name and keeps the address as supporting detail', () => {
    renderList([worker({ name: 'crunch-1' })]);

    expect(screen.getByText('crunch-1').className).toMatch(/identity/);
    expect(screen.getByText('172.20.0.1:55486')).toBeTruthy();
  });

  // An unnamed worker has nothing else to identify it, so the address is promoted.
  it('promotes the address to the identity when the worker has no name', () => {
    renderList([worker()]);

    expect(screen.getByText('172.20.0.1:55486').className).toMatch(/identity/);
  });

  it('renders a row per connected worker', () => {
    renderList([worker(), worker({ id: '43', addr: '172.20.0.1:55487' })]);

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('explains what to check when nothing is consuming the queue', () => {
    renderList([]);

    expect(screen.getByText('QUEUE.WORKERS.EMPTY')).toBeTruthy();
    expect(screen.getByText('QUEUE.WORKERS.EMPTY_HINT')).toBeTruthy();
  });

  // A paused queue is supposed to have no workers, so the hint would be misleading.
  it('does not tell a paused queue to go looking for its workers', () => {
    renderList([], true);

    expect(screen.getByText('QUEUE.WORKERS.EMPTY_PAUSED')).toBeTruthy();
    expect(screen.queryByText('QUEUE.WORKERS.EMPTY_HINT')).toBeNull();
  });
});
