import type {
  AppControllerRoute,
  AppViewRoute,
  BullBoardQueues,
  ControllerHandlerReturnType,
  HTTPMethod,
  IServerAdapter,
  UIConfig,
} from '@bull-board/api/dist/typings/app';
import ejs from 'ejs';
import { Elysia } from 'elysia';

export class ElysiaAdapter implements IServerAdapter {
  private plugin = new Elysia({
    name: '@bull-board/elysia',
  }).as('plugin');
  private basePath = '';
  private entryRoute: AppViewRoute | undefined;
  private statics: { path: string; route: string } | undefined;
  private bullBoardQueues: BullBoardQueues | undefined;
  private viewPath: string | undefined;
  private uiConfig: UIConfig = {};

  constructor(basePath = '') {
    if (basePath.length) {
      // it shows prefix is "" in types
      this.basePath = basePath;
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      this.plugin.config.prefix = this.basePath;
    }
  }

  public setStaticPath(staticsRoute: string, staticsPath: string): ElysiaAdapter {
    this.statics = { route: staticsRoute, path: staticsPath };

    return this;
  }

  public setViewsPath(viewPath: string): ElysiaAdapter {
    this.viewPath = viewPath;

    return this;
  }

  public setErrorHandler(handler: (error: Readonly<Error>) => ControllerHandlerReturnType) {
    this.plugin.onError(({ error, set }) => {
      const response = handler(error as any);
      set.status = response.status || 500;

      return response.body;
    });

    return this;
  }

  public setApiRoutes(routes: AppControllerRoute[]): ElysiaAdapter {
    for (const { route, handler, method } of routes) {
      const methods = Array.isArray(method) ? method : [method];

      for (const method of methods) {
        this.registerRoute(route, method, handler);
      }
    }

    return this;
  }

  public setEntryRoute(routeDef: AppViewRoute): ElysiaAdapter {
    this.entryRoute = routeDef;

    return this;
  }

  public setQueues(bullBoardQueues: BullBoardQueues): ElysiaAdapter {
    this.bullBoardQueues = bullBoardQueues;
    return this;
  }

  public setUIConfig(config: UIConfig = {}): ElysiaAdapter {
    this.uiConfig = config;

    return this;
  }

  public registerPlugin() {
    if (!this.statics) {
      throw new Error(`Please call 'setStaticPath' before using 'registerHandlers'`);
    }
    if (!this.entryRoute) {
      throw new Error(`Please call 'setEntryRoute' before using 'registerHandlers'`);
    }
    if (!this.viewPath) {
      throw new Error(`Please call 'setViewsPath' before using 'registerHandlers'`);
    }

    if (!this.uiConfig) {
      throw new Error(`Please call 'setUIConfig' before using 'registerHandlers'`);
    }

    const { method, route, handler } = this.entryRoute;

    const routes = Array.isArray(route) ? route : [route];

    for (const route of routes) {
      this.plugin.route(method.toUpperCase(), route, async () => {
        const { name: filename, params } = handler({
          basePath: this.basePath,
          uiConfig: this.uiConfig,
        });

        return new Response(await ejs.renderFile(`${this.viewPath}/${filename}`, params), {
          headers: {
            'content-type': 'text/html',
          },
        });
      });
    }

    const glob = new Bun.Glob(`${this.statics.path}/**/*`);
    for (const path of glob.scanSync()) {
      this.plugin.get(
        // TODO: maybe recode this
        path.substring(path.indexOf('dist') + 4).replaceAll('\\', '/'),
        () => new Response(Bun.file(path))
      );
    }

    return this.plugin.as('plugin');
  }

  private registerRoute(
    routeOrRoutes: string | string[],
    method: HTTPMethod,
    handler: AppControllerRoute['handler']
  ) {
    const { bullBoardQueues } = this;

    if (!bullBoardQueues) {
      throw new Error(`Please call 'setQueues' before using 'registerHandlers'`);
    }

    const routes = Array.isArray(routeOrRoutes) ? routeOrRoutes : [routeOrRoutes];

    for (const route of routes) {
      this.plugin.route(method.toUpperCase(), route, async ({ params, body, query, set }) => {
        const response = await handler({
          queues: this.bullBoardQueues as BullBoardQueues,
          params: Object.fromEntries(
            Object.entries(params || {}).map(([key, value]) => [
              key,
              typeof value === 'string' ? decodeURIComponent(value) : value,
            ])
          ),
          body: body as Record<string, unknown>,
          query,
        });

        if (response.status) set.status = response.status;

        return response.body;
      });
    }
  }
}
