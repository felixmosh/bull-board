import { http, HttpResponse, type HttpHandler } from 'msw';
import type {
  AppControllerRoute,
  BullBoardQueues,
  ControllerHandlerReturnType,
  HTTPMethod,
  IServerAdapter,
  UIConfig,
} from '@bull-board/api/typings/app';

export class MSWServerAdapter implements IServerAdapter {
  private bullBoardQueues: BullBoardQueues | undefined;
  private errorHandler: ((error: Error) => ControllerHandlerReturnType) | undefined;
  private uiConfig: UIConfig = {};
  private _handlers: HttpHandler[] = [];
  private basePath = '';

  setBasePath(path: string): this {
    this.basePath = path;
    return this;
  }

  setQueues(queues: BullBoardQueues): this {
    this.bullBoardQueues = queues;
    return this;
  }

  setViewsPath(): this {
    return this;
  }

  setStaticPath(): this {
    return this;
  }

  setEntryRoute(): this {
    return this;
  }

  setErrorHandler(handler: (error: Error) => ControllerHandlerReturnType): this {
    this.errorHandler = handler;
    return this;
  }

  setApiRoutes(routes: AppControllerRoute[]): this {
    this._handlers = routes.flatMap((route) => {
      const methods = Array.isArray(route.method) ? route.method : [route.method];
      const pathPatterns = Array.isArray(route.route) ? route.route : [route.route];

      return methods.flatMap((method) =>
        pathPatterns.map((pathPattern) =>
          this.createHandler(method, pathPattern, route.handler)
        )
      );
    });
    return this;
  }

  setUIConfig(config: UIConfig): this {
    this.uiConfig = config ?? {};
    return this;
  }

  getHandlers(): HttpHandler[] {
    return this._handlers;
  }

  private createHandler(
    method: HTTPMethod,
    pathPattern: string,
    handler: AppControllerRoute['handler']
  ): HttpHandler {
    const fullPath = `${this.basePath}${pathPattern}`;

    return (http[method] as any)(fullPath, async ({ params: mswParams, request }: any) => {
      const url = new URL(request.url);

      let reqBody: Record<string, unknown> = {};
      if (method !== 'get') {
        try {
          reqBody = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        } catch {}
      }

      try {
        const response = await handler({
          queues: this.bullBoardQueues!,
          uiConfig: this.uiConfig,
          params: mswParams as Record<string, string>,
          query: Object.fromEntries(url.searchParams.entries()),
          body: reqBody,
          headers: Object.fromEntries(request.headers.entries()),
        });

        if (response.status === 204) {
          return new HttpResponse(null, { status: 204 });
        }

        return HttpResponse.json(response.body, { status: response.status ?? 200 });
      } catch (e) {
        if (!this.errorHandler || !(e instanceof Error)) {
          throw e;
        }
        const errorResponse = this.errorHandler(e);
        return HttpResponse.json(errorResponse.body, {
          status: errorResponse.status ?? 500,
        });
      }
    });
  }
}
