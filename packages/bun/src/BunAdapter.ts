import type {
  AppControllerRoute,
  AppViewRoute,
  BullBoardQueues,
  ControllerHandlerReturnType,
  HTTPMethod,
  IServerAdapter,
  UIConfig,
} from '@bull-board/api/typings/app';
import ejs from 'ejs';
import { file } from 'bun';

export class BunAdapter implements IServerAdapter {
  private basePath = '/';
  private bullBoardQueues: BullBoardQueues | undefined;
  private errorHandler: ((error: Error) => ControllerHandlerReturnType) | undefined;
  private uiConfig: UIConfig = {};
  private staticRoute?: string;
  private staticPath?: string;
  private viewPath?: string;
  private entryRoute?: AppViewRoute;
  private apiRoutes: AppControllerRoute[] = [];

  public setBasePath(path: string): this {
    this.basePath = path;
    return this;
  }

  public setStaticPath(staticRoute: string, staticPath: string): this {
    this.staticRoute = staticRoute;
    this.staticPath = staticPath;
    return this;
  }

  public setViewsPath(viewPath: string): this {
    this.viewPath = viewPath;
    return this;
  }

  public setErrorHandler(handler: (error: Error) => ControllerHandlerReturnType): this {
    this.errorHandler = handler;
    return this;
  }

  public setApiRoutes(routes: readonly AppControllerRoute[]): this {
    this.apiRoutes = [...routes];
    return this;
  }

  public setEntryRoute(routeDef: AppViewRoute): this {
    this.entryRoute = routeDef;
    return this;
  }

  public setQueues(bullBoardQueues: BullBoardQueues): this {
    this.bullBoardQueues = bullBoardQueues;
    return this;
  }

  public setUIConfig(config: UIConfig = {}): this {
    this.uiConfig = config;
    return this;
  }

  public registerPlugin(): (request: Request) => Promise<Response> | Response {
    if (!this.staticRoute || !this.staticPath) {
      throw new Error(`Please call 'setStaticPath' before using 'registerPlugin'`);
    }
    if (!this.entryRoute) {
      throw new Error(`Please call 'setEntryRoute' before using 'registerPlugin'`);
    }
    if (!this.viewPath) {
      throw new Error(`Please call 'setViewsPath' before using 'registerPlugin'`);
    }
    if (!this.uiConfig) {
      throw new Error(`Please call 'setUIConfig' before using 'registerPlugin'`);
    }
    if (!this.bullBoardQueues) {
      throw new Error(`Please call 'setQueues' before using 'registerPlugin'`);
    }

    return async (request: Request): Promise<Response> => {
      const url = new URL(request.url);
      const pathname = url.pathname;

      try {
        // Remove base path from pathname for routing
        const routePath = this.basePath === '/' 
          ? pathname 
          : pathname.startsWith(this.basePath) 
            ? pathname.slice(this.basePath.length) || '/'
            : pathname;

        // Handle static files
        if (this.staticRoute && this.staticPath && routePath.startsWith(this.staticRoute)) {
          const staticFilePath = routePath.replace(this.staticRoute, '');
          const fullPath = `${this.staticPath}${staticFilePath}`;
          
          try {
            const bunFile = file(fullPath);
            if (await bunFile.exists()) {
              return new Response(bunFile);
            }
          } catch (error) {
            // File not found, continue to other routes
          }
        }

        // Handle entry route (UI page)
        if (this.entryRoute) {
          const entryRoutes = Array.isArray(this.entryRoute.route) 
            ? this.entryRoute.route 
            : [this.entryRoute.route];
          
          const method = request.method.toLowerCase();
          if (entryRoutes.includes(routePath) && method === this.entryRoute.method) {
            const { name: fileName, params } = this.entryRoute.handler({
              basePath: this.basePath,
              uiConfig: this.uiConfig,
            });

            const template = await ejs.renderFile(`${this.viewPath}/${fileName}`, params);
            return new Response(template, {
              headers: { 'Content-Type': 'text/html' },
            });
          }
        }

        // Handle API routes
        for (const route of this.apiRoutes) {
          const methods = Array.isArray(route.method) ? route.method : [route.method];
          const routePatterns = Array.isArray(route.route) ? route.route : [route.route];

          for (const routePattern of routePatterns) {
            const { match, params } = this.matchRoute(routePath, routePattern);
            
            if (match && methods.includes(request.method.toLowerCase() as HTTPMethod)) {
              let body: any = {};
              
              // Parse request body for non-GET requests
              if (request.method !== 'GET') {
                try {
                  const text = await request.text();
                  if (text) {
                    body = JSON.parse(text);
                  }
                } catch (e) {
                  // Body parsing failed, use empty object
                }
              }

              // Build query parameters
              const query: Record<string, any> = {};
              url.searchParams.forEach((value, key) => {
                query[key] = value;
              });

              // Build headers
              const headers: Record<string, string> = {};
              request.headers.forEach((value, key) => {
                headers[key] = value;
              });

              const response = await route.handler({
                queues: this.bullBoardQueues!,
                params,
                query,
                body,
                headers,
              });

              if (response.status === 204) {
                return new Response(null, { status: 204 });
              }

              return new Response(JSON.stringify(response.body), {
                status: response.status || 200,
                headers: { 'Content-Type': 'application/json' },
              });
            }
          }
        }

        // No route matched
        return new Response('Not Found', { status: 404 });
      } catch (error) {
        if (this.errorHandler && error instanceof Error) {
          const response = this.errorHandler(error);
          const body = typeof response.body === 'string' 
            ? response.body 
            : JSON.stringify(response.body);
          
          return new Response(body, {
            status: response.status || 500,
            headers: { 
              'Content-Type': typeof response.body === 'string' 
                ? 'text/plain' 
                : 'application/json' 
            },
          });
        }
        
        // Fallback error response
        return new Response('Internal Server Error', { status: 500 });
      }
    };
  }

  /**
   * Match a request path against a route pattern
   * Supports dynamic parameters like /api/:queueName
   */
  private matchRoute(
    path: string, 
    pattern: string
  ): { match: boolean; params: Record<string, string> } {
    const pathParts = path.split('/').filter(Boolean);
    const patternParts = pattern.split('/').filter(Boolean);

    if (pathParts.length !== patternParts.length) {
      return { match: false, params: {} };
    }

    const params: Record<string, string> = {};

    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i];
      const pathPart = pathParts[i];

      if (patternPart.startsWith(':')) {
        // Dynamic parameter
        const paramName = patternPart.slice(1);
        params[paramName] = decodeURIComponent(pathPart);
      } else if (patternPart !== pathPart) {
        // Static part doesn't match
        return { match: false, params: {} };
      }
    }

    return { match: true, params };
  }
}
