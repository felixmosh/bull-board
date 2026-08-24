import {
  AppControllerRoute,
  BoardHooks,
  BullBoardRequest,
  ControllerHandlerReturnType,
} from '../typings/app';
import { errorResponse } from './errors';

export function wrapHandlerWithHooks(
  route: AppControllerRoute,
  hooks: BoardHooks
): AppControllerRoute['handler'] {
  const originalHandler = route.handler;
  const method = Array.isArray(route.method) ? route.method[0] : route.method;
  const routePath = Array.isArray(route.route) ? route.route[0] : route.route;

  return async (request?: BullBoardRequest): Promise<ControllerHandlerReturnType> => {
    const context = { method, route: routePath, request: request as BullBoardRequest };

    if (hooks.before) {
      const beforeResult = await hooks.before(context);
      if (beforeResult && beforeResult.allow === false) {
        return errorResponse(
          beforeResult.status ?? 403,
          'ERRORS.FORBIDDEN',
          beforeResult.message ? { message: beforeResult.message } : {}
        );
      }
    }

    const result = await originalHandler(request);

    return hooks.after ? hooks.after(context, result) : result;
  };
}
