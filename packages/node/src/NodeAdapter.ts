import { IncomingMessage, ServerResponse } from 'http';
import path from 'path';
import type {
  AppControllerRoute,
  AppViewRoute,
  BullBoardQueues,
  ControllerHandlerReturnType,
  IServerAdapter,
  UIConfig,
} from '@bull-board/api/typings/app';
import ejs from 'ejs';

export class NodeAdapter implements IServerAdapter {
  private basePath = '';
  private viewsPath = '';
  private entryRoute: AppViewRoute | undefined;
  private errorHandler: ((error: Error) => ControllerHandlerReturnType) | undefined;
  private uiConfig: UIConfig = {};
  protected queues: BullBoardQueues | undefined;
  protected apiRoutes: AppControllerRoute[] = [];
  protected staticPath: { route: string; directory: string } | undefined;

  public setBasePath(basePath: string): NodeAdapter {
    this.basePath = normalizeBasePath(basePath);
    return this;
  }

  public setViewsPath(viewPath: string): NodeAdapter {
    this.viewsPath = viewPath;
    return this;
  }

  public setStaticPath(staticsRoute: string, staticsPath: string): NodeAdapter {
    this.staticPath = { route: staticsRoute, directory: staticsPath };
    return this;
  }

  public setEntryRoute(route: AppViewRoute): NodeAdapter {
    this.entryRoute = route;
    return this;
  }

  public setErrorHandler(handler: (error: Error) => ControllerHandlerReturnType): NodeAdapter {
    this.errorHandler = handler;
    return this;
  }

  public setApiRoutes(routes: AppControllerRoute[]): NodeAdapter {
    this.apiRoutes = routes;
    return this;
  }

  public setQueues(queues: BullBoardQueues): NodeAdapter {
    this.queues = queues;
    return this;
  }

  public setUIConfig(config: UIConfig): NodeAdapter {
    this.uiConfig = config;
    return this;
  }

  public async handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const originalUrl =
      'originalUrl' in request && typeof request.originalUrl === 'string'
        ? request.originalUrl
        : (request.url ?? '/');
    const route = this.entryRoute;
    if (!route || !matchesEntryRoute(route, this.basePath, request.method ?? '', originalUrl)) {
      return false;
    }
    if (response.destroyed || response.writableEnded) return true;

    try {
      const { name, params } = route.handler({ basePath: this.basePath, uiConfig: this.uiConfig });
      const html = await ejs.renderFile(path.join(this.viewsPath, name), params);
      if (!response.destroyed && !response.writableEnded) {
        response.statusCode = 200;
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(request.method === 'HEAD' ? undefined : html);
      }
    } catch {
      if (response.destroyed || response.writableEnded) return true;
      if (response.headersSent) {
        response.destroy();
        return true;
      }
      const result = this.errorHandler?.(new Error('Dashboard rendering failed'));
      if (!result) {
        response.statusCode = 500;
        response.end();
      } else {
        response.statusCode = result.status ?? 500;
        if (response.statusCode === 204) {
          response.end();
        } else {
          response.setHeader(
            'Content-Type',
            typeof result.body === 'string'
              ? 'text/plain; charset=utf-8'
              : 'application/json; charset=utf-8'
          );
          response.end(typeof result.body === 'string' ? result.body : JSON.stringify(result.body));
        }
      }
    }
    return true;
  }
}

function normalizeBasePath(basePath: string): string {
  if (!basePath || basePath === '/') return '';
  return `/${basePath.split('/').filter(Boolean).join('/')}`;
}

function matchesEntryRoute(
  route: AppViewRoute,
  basePath: string,
  method: string,
  originalUrl: string
): boolean {
  const pathname = originalUrl.split(/[?#]/, 1)[0] || '/';
  if (basePath && pathname !== basePath && !pathname.startsWith(`${basePath}/`)) return false;
  const strippedPath = pathname.slice(basePath.length) || '/';
  const normalizedPath = strippedPath.length > 1 ? strippedPath.replace(/\/$/, '') : strippedPath;
  const methods = Array.isArray(route.method) ? route.method : [route.method];
  const routes = Array.isArray(route.route) ? route.route : [route.route];
  return (
    methods.some(
      (entry) =>
        entry.toLowerCase() === method.toLowerCase() ||
        (entry.toLowerCase() === 'get' && method.toLowerCase() === 'head')
    ) &&
    routes.some((entry) => {
      const normalizedRoute = entry.length > 1 ? entry.replace(/\/$/, '') : entry;
      const segments = normalizedPath.split('/');
      const routeSegments = normalizedRoute.split('/');
      return (
        segments.length === routeSegments.length &&
        routeSegments.every((segment, index) =>
          segment.startsWith(':') ? segments[index].length > 0 : segments[index] === segment
        )
      );
    })
  );
}
