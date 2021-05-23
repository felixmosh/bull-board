import { ControllerHandlerReturnType } from '../../typings/app';

export function errorHandler(error: Error): ControllerHandlerReturnType {
  return {
    status: 500,
    body: {
      error: 'Internal server error',
      message: error.message,
      details: error.stack,
    },
  };
}
