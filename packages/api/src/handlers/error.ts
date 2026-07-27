import { ControllerHandlerReturnType, HTTPStatus } from '../../typings/app';
import { errorResponse } from '../errors';

export function errorHandler(
  error: Error & { statusCode?: HTTPStatus }
): ControllerHandlerReturnType {
  return errorResponse(error.statusCode || 500, 'ERRORS.INTERNAL_SERVER_ERROR', {
    // Whatever was thrown phrased itself already and carries no key, so this is the one place
    // where a raw string is the only honest answer.
    message: error.message,
    details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
  });
}
