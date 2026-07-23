import { toast } from 'react-toastify';

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
  const toastId = toast.loading(messages.pending);

  try {
    const result = await action();

    // `Api` resolves failed requests with `{ error }` and toasts them itself.
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
