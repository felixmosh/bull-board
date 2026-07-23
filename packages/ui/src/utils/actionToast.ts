import { toast } from 'react-toastify';

function hasError(result: unknown): boolean {
  if (Array.isArray(result)) {
    return result.some(hasError);
  }

  return !!result && typeof result === 'object' && 'error' in result;
}

/**
 * Runs a queue action behind a pending toast so a long request never looks like a no-op,
 * then swaps that toast for a success message once it settles.
 */
export async function runWithToast<T>(
  action: () => Promise<T>,
  messages: { pending: string; success: string }
): Promise<T> {
  const toastId = toast.loading(messages.pending);

  try {
    const result = await action();

    // `Api` resolves failed requests with `{ error }` after raising its own error toast,
    // so a failure here only needs the pending toast cleared.
    if (hasError(result)) {
      toast.dismiss(toastId);
    } else {
      toast.update(toastId, {
        render: messages.success,
        type: 'success',
        isLoading: false,
        autoClose: 4000,
      });
    }

    return result;
  } catch (e) {
    toast.dismiss(toastId);
    throw e;
  }
}
