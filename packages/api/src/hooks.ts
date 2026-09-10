import { errorResponse } from './errors';
import type { ResponseSchemas } from './schemas/responses';
import type {
  AppControllerRoute,
  BoardHooks,
  BullBoardRequest,
  ControllerHandlerReturnType,
} from './types';
import { validateRequest, validateResponse } from './validation';

export function wrapHandler<TResponse extends keyof ResponseSchemas>(
  route: AppControllerRoute<TResponse>,
  { hooks, validateResponses }: { hooks?: BoardHooks; validateResponses: boolean }
): AppControllerRoute<TResponse>['handler'] {
  const originalHandler = route.handler;
  const method = Array.isArray(route.method) ? route.method[0] : route.method;
  const routePath = Array.isArray(route.route) ? route.route[0] : route.route;

  return async (
    request?: BullBoardRequest
  ): Promise<ControllerHandlerReturnType<ResponseSchemas[TResponse]>> => {
    const context = { method, route: routePath, request: request as BullBoardRequest };

    if (hooks?.before) {
      let beforeResult;
      try {
        beforeResult = await hooks.before(context);
      } catch {
        return errorResponse(500, 'ERRORS.INTERNAL_SERVER_ERROR');
      }

      if (beforeResult && beforeResult.allow === false) {
        return errorResponse(
          beforeResult.status ?? 403,
          beforeResult.errorKey ?? 'ERRORS.FORBIDDEN',
          beforeResult.message ? { message: beforeResult.message } : {}
        );
      }
    }

    // Runs after `before` so a visibility guard rejects before a 400 can reveal the route exists.
    if (request) {
      const rejected = validateRequest(route, request);
      if (rejected) {
        return rejected;
      }
    }

    const result = await originalHandler(request);

    // An `after` hook may reshape the body, so it cannot be narrowed to the declared response.
    const finalResult = hooks?.after
      ? ((await hooks.after(context, result)) as ControllerHandlerReturnType<
          ResponseSchemas[TResponse]
        >)
      : result;

    return validateResponses ? validateResponse(route, finalResult) : finalResult;
  };
}
