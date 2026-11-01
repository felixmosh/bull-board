import { IncomingMessage, ServerResponse } from 'http';
import path from 'path';
import { errorResponse } from '@bull-board/api/dist/errors.js';
import type {
  AppControllerRoute,
  AppViewRoute,
  BullBoardQueues,
  ControllerHandlerReturnType,
  IServerAdapter,
  UIConfig,
} from '@bull-board/api/typings/app';
import ejs from 'ejs';
import { matchRoute, normalizeRoutes, NormalizedRoute } from './routes';
import { serveStatic } from './static';

export class NodeAdapter implements IServerAdapter {
  private basePath = '';
  private viewsPath = '';
  private entryRoute: AppViewRoute | undefined;
  private errorHandler: ((error: Error) => ControllerHandlerReturnType) | undefined;
  private uiConfig: UIConfig = {};
  private queues: BullBoardQueues = new Map();
  private apiRoutes: NormalizedRoute[] = [];
  private staticPath: { route: string; directory: string } | undefined;

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
    this.apiRoutes = normalizeRoutes(routes);
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
    const pathname = originalUrl.split(/[?#]/, 1)[0] || '/';
    if (this.basePath && pathname !== this.basePath && !pathname.startsWith(`${this.basePath}/`))
      return false;
    const mountedPath = pathname.slice(this.basePath.length) || '/';
    if (this.staticPath) {
      if (await serveStatic(request, response, mountedPath, this.staticPath)) return true;
    }
    const apiMatch = matchRoute(this.apiRoutes, request.method ?? '', mountedPath);
    if (apiMatch.kind === 'malformed') {
      this.writeTransportError(response, 400, 'ERRORS.INVALID_QUERY_PARAM');
      return true;
    }
    if (apiMatch.kind === 'matched') {
      if (response.destroyed || response.writableEnded) return true;
      const headers = Object.fromEntries(
        Object.entries(request.headers).map(([name, value]) => [
          name,
          Array.isArray(value) ? value.join(name === 'cookie' ? '; ' : ', ') : value,
        ])
      );
      try {
        const body = await readRequestBody(request);
        const result = await apiMatch.route.handler({
          queues: this.queues,
          uiConfig: this.uiConfig,
          headers,
          params: apiMatch.params,
          query: parseQuery(originalUrl),
          body,
        });
        this.writeResult(response, result, { json: true, head: request.method === 'HEAD' });
      } catch (error) {
        if (response.destroyed || response.writableEnded) return true;
        if (response.headersSent) {
          response.destroy();
          return true;
        }
        if (error instanceof TransportError) {
          this.writeTransportError(response, error.status, 'ERRORS.INVALID_REQUEST_BODY');
          return true;
        }
        this.writeError(
          response,
          error instanceof Error ? error : new Error('Request handler failed'),
          request.method === 'HEAD'
        );
      }
      return true;
    }
    if (!route || !matchesEntryRoute(route, request.method ?? '', mountedPath)) return false;
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
      this.writeError(response, new Error('Dashboard rendering failed'), request.method === 'HEAD');
    }
    return true;
  }

  private writeError(response: ServerResponse, error: Error, head: boolean): void {
    if (response.destroyed || response.writableEnded) return;
    if (response.headersSent) {
      response.destroy();
      return;
    }
    const fallback = errorResponse(500, 'ERRORS.INTERNAL_SERVER_ERROR');
    try {
      this.writeResult(response, this.errorHandler?.(error) ?? fallback, { json: false, head });
    } catch {
      if (response.headersSent) response.destroy();
      else this.writeResult(response, fallback, { json: true, head });
    }
  }

  private writeResult(
    response: ServerResponse,
    result: ControllerHandlerReturnType,
    { json, head }: { json: boolean; head: boolean }
  ): void {
    if (response.destroyed || response.writableEnded) return;
    response.statusCode = result.status ?? 200;
    if (response.statusCode === 204) {
      response.removeHeader('Content-Type');
      response.removeHeader('Content-Length');
      response.removeHeader('Transfer-Encoding');
      response.end();
      return;
    }
    const text = !json && typeof result.body === 'string';
    const body = text ? result.body : JSON.stringify(result.body);
    response.setHeader(
      'Content-Type',
      text ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8'
    );
    response.end(head ? undefined : body);
  }

  private writeTransportError(
    response: ServerResponse,
    status: 400 | 413,
    key: 'ERRORS.INVALID_REQUEST_BODY' | 'ERRORS.INVALID_QUERY_PARAM'
  ): void {
    if (response.destroyed || response.writableEnded) return;
    if (response.headersSent) {
      response.destroy();
      return;
    }
    // The API status union excludes 413; it still owns the translated error body.
    const { body } = errorResponse(400, key);
    response.statusCode = status;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(JSON.stringify(body));
  }
}

async function readRequestBody(request: IncomingMessage): Promise<unknown> {
  if ('body' in request && request.body !== undefined) return request.body;
  if (request.destroyed || request.readableEnded) return undefined;
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of request.iterator({ destroyOnReturn: false })) {
      const input: unknown = chunk;
      if (!Buffer.isBuffer(input) && typeof input !== 'string') throw new TransportError(400);
      const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
      size += buffer.length;
      if (size > 100 * 1024) throw new TransportError(413);
      chunks.push(buffer);
    }
  } catch (error) {
    if (!request.destroyed) request.resume();
    throw error instanceof TransportError ? error : new TransportError(400);
  }
  if (!size) return undefined;
  try {
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return body;
  } catch {
    throw new TransportError(400);
  }
}

function parseQuery(url: string): Record<string, string | string[]> {
  const query = new Map<string, string | string[]>();
  const start = url.indexOf('?');
  const search = start === -1 ? '' : url.slice(start + 1).split('#', 1)[0];
  for (const [name, value] of new URLSearchParams(search)) {
    const previous = query.get(name);
    query.set(
      name,
      previous === undefined
        ? value
        : Array.isArray(previous)
          ? [...previous, value]
          : [previous, value]
    );
  }
  return Object.fromEntries(query);
}

class TransportError extends Error {
  constructor(public readonly status: 400 | 413) {
    super();
  }
}

function normalizeBasePath(basePath: string): string {
  if (!basePath || basePath === '/') return '';
  return `/${basePath.split('/').filter(Boolean).join('/')}`;
}

function matchesEntryRoute(route: AppViewRoute, method: string, pathname: string): boolean {
  const normalizedPath = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
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
