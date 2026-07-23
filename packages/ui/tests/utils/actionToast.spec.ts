import { toast } from 'react-toastify';
import { runWithToast } from '../../src/utils/actionToast';

jest.mock('react-toastify', () => ({
  toast: {
    loading: jest.fn(() => 'toast-id'),
    update: jest.fn(),
    dismiss: jest.fn(),
  },
}));

const messages = { pending: 'pending', success: 'success' };

beforeEach(() => {
  jest.clearAllMocks();
});

it('shows a pending toast while the action runs and resolves it on success', async () => {
  let settle!: () => void;
  const action = jest.fn(
    () =>
      new Promise<void>((resolve) => {
        settle = () => resolve();
      })
  );

  const run = runWithToast(action, messages);

  expect(toast.loading).toHaveBeenCalledWith('pending');
  expect(toast.update).not.toHaveBeenCalled();

  settle();
  await run;

  expect(toast.update).toHaveBeenCalledWith(
    'toast-id',
    expect.objectContaining({ render: 'success', type: 'success', isLoading: false })
  );
  expect(toast.dismiss).not.toHaveBeenCalled();
});

it('drops the pending toast when the API resolves with an error payload', async () => {
  await runWithToast(() => Promise.resolve({ error: 'Queue is missing' }), messages);

  expect(toast.dismiss).toHaveBeenCalledWith('toast-id');
  expect(toast.update).not.toHaveBeenCalled();
});

it('drops the pending toast when any request in a batch failed', async () => {
  await runWithToast(() => Promise.resolve([{}, { error: 'nope' }, {}]), messages);

  expect(toast.dismiss).toHaveBeenCalledWith('toast-id');
  expect(toast.update).not.toHaveBeenCalled();
});

it('reports success for a batch where every request succeeded', async () => {
  await runWithToast(() => Promise.resolve([{}, {}]), messages);

  expect(toast.update).toHaveBeenCalledWith(
    'toast-id',
    expect.objectContaining({ render: 'success' })
  );
});

it('drops the pending toast and rethrows when the action throws', async () => {
  const boom = new Error('boom');

  await expect(runWithToast(() => Promise.reject(boom), messages)).rejects.toThrow(boom);

  expect(toast.dismiss).toHaveBeenCalledWith('toast-id');
});
