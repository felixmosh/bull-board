import { act, screen, waitFor } from '@testing-library/react';
import { Toaster } from '../../src/components/Toaster/Toaster';
import { toastManager } from '../../src/services/toastManager';
import { render } from '../testUtils';

it('renders a queued toast and closes it again', async () => {
  render(<Toaster />);

  let id!: string;
  act(() => {
    id = toastManager.add({ type: 'success', title: 'Jobs were retried' });
  });

  const toast = await screen.findByText('Jobs were retried');
  expect(toast.closest('[data-type="success"]')).toBeTruthy();

  act(() => {
    toastManager.close(id);
  });

  await waitFor(() => expect(screen.queryByText('Jobs were retried')).toBeNull());
});

it('marks an error toast so it picks up the failed styling', async () => {
  render(<Toaster />);

  act(() => {
    toastManager.add({ type: 'error', title: 'Queue must be paused before obliteration' });
  });

  const toast = await screen.findByText('Queue must be paused before obliteration');
  expect(toast.closest('[data-type="error"]')).toBeTruthy();
});

it('keeps a loading toast on screen and swaps it for the success message', async () => {
  render(<Toaster />);

  let id!: string;
  act(() => {
    id = toastManager.add({ type: 'loading', title: 'Retrying...', timeout: 0 });
  });

  await screen.findByText('Retrying...');

  act(() => {
    toastManager.update(id, { type: 'success', title: 'Retried' });
  });

  await screen.findByText('Retried');
  expect(screen.queryByText('Retrying...')).toBeNull();
});
