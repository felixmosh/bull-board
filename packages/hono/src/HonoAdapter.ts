import path from 'node:path';

import type {
  AppControllerRoute,
  AppViewRoute,
  BullBoardQueues,
  ControllerHandlerReturnType,
  IServerAdapter,
  UIConfig,
} from '@bull-board/api/dist/typings/app';
import type { serveStatic as nodeServeStatic } from '@hono/node-server/serve-static';
import ejs from 'ejs';
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { serveStatic as bunServeStatic } from 'hono/bun';
import type { serveStatic as cloudflarePagesServeStatic } from 'hono/cloudflare-pages';
import type { serveStatic as cloudflareWorkersServeStatic } from 'hono/cloudflare-workers';
import type { serveStatic as denoServeStatic } from 'hono/deno';

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
      | typeof denoServeStatic
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

  private registerRoute(
    routeOrRoutes: string | string[],
    method: 'get' | 'post' | 'put',
    handler: AppControllerRoute['handler']
  ) {
    const { bullBoardQueues } = this;

    if (!bullBoardQueues) {
      throw new Error(`Please call 'setQueues' before using 'registerPlugin'`);
    }

    const routes = Array.isArray(routeOrRoutes) ? routeOrRoutes : [routeOrRoutes];

    routes.forEach((route) => {
      this.apiRoutes[method](route, async (c: Context) => {
        try {
          const response = await handler({
            queues: bullBoardQueues,
            params: c.req.param(),
            query: c.req.query(),
          });
          if (response.status == 204) return c.body(null, 204);
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
    const { staticRoute, staticPath, entryRoute, viewPath, uiConfig } = this;

    if (!staticRoute || !staticPath) {
      throw new Error(`Please call 'setStaticPath' before using 'registerPlugin'`);
    } else if (!entryRoute) {
      throw new Error(`Please call 'setEntryRoute' before using 'registerPlugin'`);
    } else if (!viewPath) {
      throw new Error(`Please call 'setViewsPath' before using 'registerPlugin'`);
    } else if (!uiConfig) {
      throw new Error(`Please call 'setUIConfig' before using 'registerPlugin'`);
    }

    const app = new Hono();

    app.get(
      `${staticRoute}/*`,
      this.serveStatic({
        root: path.relative(process.cwd(), staticPath),
        rewriteRequestPath: (p: string) => p.replace(path.join(this.basePath, staticRoute), ''),
      })
    );

    app.route('/', this.apiRoutes);

    const routeOrRoutes = entryRoute.route;
    const routes = Array.isArray(routeOrRoutes) ? routeOrRoutes : [routeOrRoutes];

    routes.forEach((route) => {
      app[entryRoute.method](route, async (c: Context) => {
        const { name: fileName, params } = entryRoute.handler({
          basePath: this.basePath,
          uiConfig,
        });

        const template = await ejs.renderFile(`${this.viewPath}/${fileName}`, params);
        return c.html(template);
      });
    });

    return app;
  }
}
