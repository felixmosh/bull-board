import type {
  AppControllerRoute,
  AppViewRoute,
  BullBoardQueues,
  ControllerHandlerReturnType,
  HTTPMethod,
  IServerAdapter,
  UIConfig,
} from '@bull-board/api/dist/typings/app';
import type { serveStatic as nodeServeStatic } from '@hono/node-server/serve-static';
import ejs from 'ejs';
import type { Context } from 'hono';
import { Hono } from 'hono';
import type { serveStatic as bunServeStatic } from 'hono/bun';
import type { serveStatic as cloudflarePagesServeStatic } from 'hono/cloudflare-pages';
import type { serveStatic as cloudflareWorkersServeStatic } from 'hono/cloudflare-workers';
import type { serveStatic as denoServeStatic } from 'hono/deno';
import path from 'node:path';

export class HonoAdapter implements IServerAdapter {
  protected bullBoardQueues: BullBoardQueues | undefined;

  protected errorHandler: ((error: Error) => ControllerHandlerReturnType) | undefined;

  protected uiConfig?: UIConfig;

  protected staticRoute?: string;

  protected staticPath?: string;

  protected entryRoute?: AppViewRoute;

  protected viewPath?: string;

  protected apiRoutes: Hono;

  protected basePath = '/';

  constructor(
    protected serveStatic:
      | typeof bunServeStatic
      | typeof nodeServeStatic
      | typeof cloudflarePagesServeStatic
      | typeof cloudflareWorkersServeStatic
      | typeof denoServeStatic,
    /**
     * only required for Cloudflare Workers. you should import it like this:
     *
     *   import manifest from '__STATIC_CONTENT_MANIFEST'
     *
     * ... and pass it as-is to the HonoAdapter constructor.
     */
    protected manifest: Record<string, unknown> = {}
  ) {
    this.apiRoutes = new Hono();
  }

  public setBasePath(path: string): this {
    this.basePath = path;
    return this;
  }

  setStaticPath(staticRoute: string, staticPath: string): this {
    this.staticRoute = staticRoute;
    this.staticPath = staticPath;
    return this;
  }

  setViewsPath(viewPath: string): this {
    this.viewPath = viewPath;
    return this;
  }

  setErrorHandler(handler: (error: Error) => ControllerHandlerReturnType): this {
    this.errorHandler = handler;
    return this;
  }

  setApiRoutes(routes: readonly AppControllerRoute[]): this {
    const { errorHandler, bullBoardQueues } = this;

    if (!errorHandler || !bullBoardQueues) {
      throw new Error('');
    }

    routes.forEach(({ method: methodOrMethods, route, handler }) => {
      const methods = Array.isArray(methodOrMethods) ? methodOrMethods : [methodOrMethods];

      methods.forEach((m) => {
        this.registerRoute(route, m, handler);
      });
    });

    return this;
  }

  setEntryRoute(routeDef: AppViewRoute): this {
    this.entryRoute = routeDef;
    return this;
  }

  setQueues(bullBoardQueues: BullBoardQueues): this {
    this.bullBoardQueues = bullBoardQueues;
    return this;
  }

  setUIConfig(config: UIConfig): this {
    this.uiConfig = config;
    return this;
  }

  registerPlugin() {
    if (!this.staticRoute || !this.staticPath) {
      throw new Error(`Please call 'setStaticPath' before using 'registerPlugin'`);
    } else if (!this.entryRoute) {
      throw new Error(`Please call 'setEntryRoute' before using 'registerPlugin'`);
    } else if (!this.viewPath) {
      throw new Error(`Please call 'setViewsPath' before using 'registerPlugin'`);
    } else if (!this.uiConfig) {
      throw new Error(`Please call 'setUIConfig' before using 'registerPlugin'`);
    }

    const app = new Hono();

    const staticBaseUrlPath = [this.basePath, this.staticRoute].join('/').replace(/\/{2,}/g, '/');
    app.get(
      `${this.staticRoute}/*`,
      this.serveStatic({
        root: path.relative(process.cwd(), this.staticPath),
        rewriteRequestPath: (p: string) => p.replace(staticBaseUrlPath, ''),
        manifest: this.manifest,
      })
    );

    app.route('/', this.apiRoutes);

    const routeOrRoutes = this.entryRoute.route;
    const routes = Array.isArray(routeOrRoutes) ? routeOrRoutes : [routeOrRoutes];

    routes.forEach((route) => {
      app[this.entryRoute!.method](route, async (c: Context) => {
        const { name: fileName, params } = this.entryRoute!.handler({
          basePath: this.basePath,
          uiConfig: this.uiConfig ?? {},
        });

        const template = await ejs.renderFile(`${this.viewPath}/${fileName}`, params);
        return c.html(template);
      });
    });

    return app;
  }

  private registerRoute(
    routeOrRoutes: string | string[],
    method: HTTPMethod,
    handler: AppControllerRoute['handler']
  ) {
    const { bullBoardQueues } = this;

    if (!bullBoardQueues) {
      throw new Error(`Please call 'setQueues' before using 'registerPlugin'`);
    }

    const routes = Array.isArray(routeOrRoutes) ? routeOrRoutes : [routeOrRoutes];

    routes.forEach((route) => {
      this.apiRoutes[method](route, async (c: Context) => {
        let reqBody = {};
        if (method !== 'get') {
          // Safely attempt to parse the request body, since the UI does not include a request body with most requests
          try {
            reqBody = await c.req.json();
          } catch {}
        }

        try {
          const response = await handler({
            queues: bullBoardQueues,
            params: c.req.param(),
            query: c.req.query(),
            body: reqBody,
          });

          if (response.status == 204) {
            return c.body(null, 204);
          }

          return c.json(response.body, response.status || 200);
        } catch (e) {
          if (!this.errorHandler || !(e instanceof Error)) {
            throw e;
          }

          const response = this.errorHandler(e);

          if (typeof response.body === 'string') {
            return c.text(response.body, response.status);
          }

          return c.json(response.body, response.status);
        }
      });
    });
  }
}
