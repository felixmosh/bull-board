import type {
  AppControllerRoute,
  AppViewRoute,
  BullBoardQueues,
  ControllerHandlerReturnType,
  IServerAdapter,
  UIConfig,
} from '@bull-board/api/typings/app';
import ejs from 'ejs';
import { file } from 'bun';

/**
 * Bun route handler type
 */
type BunHandler = (request: Request) => Response | Promise<Response>;

/**
 * Bun routes object structure
 * { [path: string]: { [method: string]: BunHandler } }
 */
type BunRoutes = Record<string, Record<string, BunHandler>>;

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

  /**
   * Builds and returns all routes as a Bun routes object
   * Returns an object where keys are paths and values are { METHOD: handler }
   */
  public getRoutes(): BunRoutes {
    if (!this.staticRoute || !this.staticPath) {
      throw new Error(`Please call 'setStaticPath' before using 'getRoutes'`);
    }
    if (!this.entryRoute) {
      throw new Error(`Please call 'setEntryRoute' before using 'getRoutes'`);
    }
    if (!this.viewPath) {
      throw new Error(`Please call 'setViewsPath' before using 'getRoutes'`);
    }
    if (!this.uiConfig) {
      throw new Error(`Please call 'setUIConfig' before using 'getRoutes'`);
    }
    if (!this.bullBoardQueues) {
      throw new Error(`Please call 'setQueues' before using 'getRoutes'`);
    }

    const routes: BunRoutes = {};

    // Register static file routes with wildcard
    const staticBasePath = this.joinPaths(this.basePath, this.staticRoute);
    routes[`${staticBasePath}/*`] = {
      GET: async (request: Request) => {
        const url = new URL(request.url);
        const pathname = url.pathname;
        const relativePath = pathname.replace(staticBasePath, '');
        const fullPath = `${this.staticPath}${relativePath}`;
        
        try {
          const bunFile = file(fullPath);
          if (await bunFile.exists()) {
            return new Response(bunFile);
          }
        } catch (error) {
          // File not found
        }
        
        return new Response('Not Found', { status: 404 });
      },
    };

    // Register entry route (UI page)
    if (this.entryRoute) {
      const entryRoutes = Array.isArray(this.entryRoute.route) 
        ? this.entryRoute.route 
        : [this.entryRoute.route];
      
      for (const route of entryRoutes) {
        const fullPath = this.joinPaths(this.basePath, route);
        const method = this.entryRoute.method.toUpperCase();
        
        if (!routes[fullPath]) {
          routes[fullPath] = {};
        }
        
        routes[fullPath][method] = async () => {
          const { name: fileName, params } = this.entryRoute!.handler({
            basePath: this.basePath,
            uiConfig: this.uiConfig,
          });

          const template = await ejs.renderFile(`${this.viewPath}/${fileName}`, params);
          return new Response(template, {
            headers: { 'Content-Type': 'text/html' },
          });
        };
      }
    }

    // Register API routes
    for (const route of this.apiRoutes) {
      const methods = Array.isArray(route.method) ? route.method : [route.method];
      const routePatterns = Array.isArray(route.route) ? route.route : [route.route];

      for (const routePattern of routePatterns) {
        const fullPath = this.joinPaths(this.basePath, routePattern);
        
        if (!routes[fullPath]) {
          routes[fullPath] = {};
        }

        for (const method of methods) {
          const upperMethod = method.toUpperCase();
          
          routes[fullPath][upperMethod] = async (request: Request) => {
            try {
              const url = new URL(request.url);
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
              for (const [key, value] of url.searchParams.entries()) {
                query[key] = value;
              }

              // Build headers
              const headers: Record<string, string> = {};
              for (const [key, value] of request.headers.entries()) {
                headers[key] = value;
              }

              // Extract params from URL (for dynamic routes like /api/:queueName)
              const params = this.extractParams(url.pathname, routePattern);

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
              
              return new Response('Internal Server Error', { status: 500 });
            }
          };
        }
      }
    }

    return routes;
  }

  /**
   * Alias for getRoutes() for backward compatibility
   */
  public registerPlugin(): BunRoutes {
    return this.getRoutes();
  }

  /**
   * Join path segments properly
   */
  private joinPaths(...segments: string[]): string {
    return segments
      .map(segment => segment.replace(/^\/+|\/+$/g, ''))
      .filter(Boolean)
      .join('/')
      .replace(/^/, '/');
  }

  /**
   * Extract parameters from a URL path based on a route pattern
   * Supports dynamic parameters like /api/:queueName
   */
  private extractParams(pathname: string, pattern: string): Record<string, string> {
    // Remove base path if present
    let path = pathname;
    if (this.basePath !== '/' && pathname.startsWith(this.basePath)) {
      path = pathname.slice(this.basePath.length);
    }
    
    const pathParts = path.split('/').filter(Boolean);
    const patternParts = pattern.split('/').filter(Boolean);

    const params: Record<string, string> = {};

    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i];
      
      if (patternPart.startsWith(':')) {
        const paramName = patternPart.slice(1);
        params[paramName] = decodeURIComponent(pathParts[i] || '');
      }
    }

    return params;
  }
}
