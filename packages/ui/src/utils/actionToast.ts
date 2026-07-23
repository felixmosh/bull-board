import { TOAST_TIMEOUT, toastManager } from '../services/toastManager';

function hasError(result: unknown): boolean {
  if (Array.isArray(result)) {
    return result.some(hasError);
  }

  return !!result && typeof result === 'object' && 'error' in result;
}

export async function runWithToast<T>(
  action: () => Promise<T>,
  messages: { pending: string; success: string }
): Promise<T> {
  const toastId = toastManager.add({
    type: 'loading',
    title: messages.pending,
    timeout: 0,
  });

  try {
    const result = await action();

    // `Api` resolves failed requests with `{ error }` and toasts them itself.
    if (hasError(result)) {
      toastManager.close(toastId);
    } else {
      toastManager.update(toastId, {
        type: 'success',
        title: messages.success,
        timeout: TOAST_TIMEOUT,
      });
    }

    return result;
  } catch (e) {
    toastManager.close(toastId);
    throw e;
  }
}
