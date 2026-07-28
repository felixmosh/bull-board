import {
  ControllerHandlerReturnType,
  ErrorResponseBody,
  ErrorTranslationKey,
  HTTPStatus,
  TranslatableMessage,
} from '../typings/app';

/**
 * Builds the error body every failing handler returns. Routing errors through here is what keeps
 * user facing English out of the API: the headline can only be a translation key, and the client
 * decides the language it is read in.
 *
 * ```ts
 * errorResponse(404, 'ERRORS.QUEUE_NOT_FOUND');
 * errorResponse(400, { key: 'ERRORS.INVALID_GRANULARITY', options: { granularity } });
 * ```
 */
export function errorResponse(
  status: HTTPStatus,
  error: ErrorTranslationKey | TranslatableMessage,
  details: Omit<ErrorResponseBody, 'error'> & Record<string, unknown> = {}
): ControllerHandlerReturnType {
  return {
    status,
    body: {
      error: typeof error === 'string' ? { key: error } : error,
      ...details,
    },
  };
}
