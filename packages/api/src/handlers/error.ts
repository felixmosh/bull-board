import { ControllerHandlerReturnType, HTTPStatus } from '../../typings/app';

export function errorHandler(
  error: Error & { statusCode?: HTTPStatus }
): ControllerHandlerReturnType {
  return {
    status: error.statusCode || 500,
    body: {
      error: 'Internal server error',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    },
  };
}
