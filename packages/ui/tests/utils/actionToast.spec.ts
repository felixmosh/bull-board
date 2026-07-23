import { toastManager } from '../../src/services/toastManager';
import { runWithToast } from '../../src/utils/actionToast';

jest.mock('../../src/services/toastManager', () => ({
  TOAST_TIMEOUT: 5000,
  toastManager: {
    add: jest.fn(() => 'toast-id'),
    update: jest.fn(),
    close: jest.fn(),
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

  expect(toastManager.add).toHaveBeenCalledWith({
    type: 'loading',
    title: 'pending',
    timeout: 0,
  });
  expect(toastManager.update).not.toHaveBeenCalled();

  settle();
  await run;

  expect(toastManager.update).toHaveBeenCalledWith(
    'toast-id',
    expect.objectContaining({ type: 'success', title: 'success' })
  );
  expect(toastManager.close).not.toHaveBeenCalled();
});

it('drops the pending toast when the API resolves with an error payload', async () => {
  await runWithToast(() => Promise.resolve({ error: 'Queue is missing' }), messages);

  expect(toastManager.close).toHaveBeenCalledWith('toast-id');
  expect(toastManager.update).not.toHaveBeenCalled();
});

it('drops the pending toast when any request in a batch failed', async () => {
  await runWithToast(() => Promise.resolve([{}, { error: 'nope' }, {}]), messages);

  expect(toastManager.close).toHaveBeenCalledWith('toast-id');
  expect(toastManager.update).not.toHaveBeenCalled();
});

it('reports success for a batch where every request succeeded', async () => {
  await runWithToast(() => Promise.resolve([{}, {}]), messages);

  expect(toastManager.update).toHaveBeenCalledWith(
    'toast-id',
    expect.objectContaining({ title: 'success' })
  );
});

it('drops the pending toast and rethrows when the action throws', async () => {
  const boom = new Error('boom');

  await expect(runWithToast(() => Promise.reject(boom), messages)).rejects.toThrow(boom);

  expect(toastManager.close).toHaveBeenCalledWith('toast-id');
});
