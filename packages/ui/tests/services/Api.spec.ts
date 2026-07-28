import type { ErrorResponseBody } from '@bull-board/api/typings/app';
import type { AxiosResponse } from 'axios';
import { Api } from '../../src/services/Api';
import { toastManager } from '../../src/services/toastManager';

// The axios interceptor that turns a failed response into a toast. It is private on the class,
// which is why the wiring is reached through the instance rather than called directly.
type WithErrorHandler = { handleError(error: { response: AxiosResponse }): Promise<any> };

const respondWith = (body: Partial<ErrorResponseBody>) =>
  (new Api() as unknown as WithErrorHandler).handleError({
    response: { data: body } as AxiosResponse,
  });

describe('Api error handling', () => {
  let add: jest.SpyInstance;

  beforeEach(() => {
    add = jest.spyOn(toastManager, 'add').mockImplementation(() => 'toast-id');
  });

  afterEach(() => {
    add.mockRestore();
  });

  // i18next runs in `cimode` under test, so a resolved key renders as the key itself.
  it('translates the keys the API sent into the toast', async () => {
    await respondWith({
      error: { key: 'ERRORS.JOB_IS_ACTIVE' },
      message: { key: 'ERRORS.JOB_IS_ACTIVE_DETAILS', options: { jobId: '42' } },
    });

    expect(add).toHaveBeenCalledWith({
      type: 'error',
      title: 'ERRORS.JOB_IS_ACTIVE',
      description: 'ERRORS.JOB_IS_ACTIVE_DETAILS',
    });
  });

  // What `handlers/error.ts` returns: a key for the headline, and the thrown error's own text,
  // which has no key, as the detail.
  it('shows a runtime string detail as it arrived', async () => {
    await respondWith({
      error: { key: 'ERRORS.INTERNAL_SERVER_ERROR' },
      message: 'Connection is closed.',
    });

    expect(add).toHaveBeenCalledWith({
      type: 'error',
      title: 'ERRORS.INTERNAL_SERVER_ERROR',
      description: 'Connection is closed.',
    });
  });

  it('leaves an error without a detail without a description', async () => {
    await respondWith({ error: { key: 'ERRORS.QUEUE_NOT_FOUND' } });

    expect(add).toHaveBeenCalledWith({
      type: 'error',
      title: 'ERRORS.QUEUE_NOT_FOUND',
      description: undefined,
    });
  });

  it('stays quiet for a code the caller resolves itself', async () => {
    await respondWith({
      error: { key: 'ERRORS.JOB_BELONGS_TO_JOB_SCHEDULER' },
      code: 'JOB_BELONGS_TO_JOB_SCHEDULER',
    });

    expect(add).not.toHaveBeenCalled();
  });

  it('still toasts a coded error the caller does not handle', async () => {
    await respondWith({ error: { key: 'ERRORS.INVALID_QUEUE' }, code: 'SOMETHING_NEW' });

    expect(add).toHaveBeenCalled();
  });

  it('resolves with the body so callers can branch on it', async () => {
    const body = { error: { key: 'ERRORS.QUEUE_NOT_FOUND' } } as const;

    await expect(respondWith(body)).resolves.toEqual(body);
  });
});
