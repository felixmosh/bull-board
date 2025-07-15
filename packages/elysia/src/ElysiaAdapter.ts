import { promises as fsPromises, glob } from 'node:fs';
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
import { Elysia } from 'elysia';
import mime from 'mimeV4';
import { extname, resolve } from 'node:path';

export class ElysiaAdapter implements IServerAdapter {
  private plugin = new Elysia({
    name: '@bull-board/elysia',
  });
  private readonly basePath: string = '';
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

    this.plugin.onParse(async ({ request }, contentType) => {
      // Handles `Content-Type: application/json` with an empty body.
      if (contentType === 'application/json') {
        const text = await request.text();
        if (text.length === 0) {
          return {};
        }
        return JSON.parse(text);
      }

      // Handles PUT/POST/PATCH with `Content-Length: 0` and no `Content-Type`.
      // Bull Board UI sends requests like this for some actions (e.g. clean job).
      if (!contentType) {
        if (request.method === 'PUT' || request.method === 'POST' || request.method === 'PATCH') {
          const contentLength = request.headers.get('content-length');
          if (contentLength === '0') {
            return {};
          }
        }
      }
    });
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

  public async registerPlugin() {
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

    const staticsPath = resolve(this.statics.path);

    const paths = await new Promise<string[]>((resolve, reject) => {
      glob(`${staticsPath}/**/*`, (err, files) => {
        if (err) {
          reject(err);
        } else {
          resolve(files);
        }
      });
    });

    for (const path of paths) {
      const relativePath = path.substring(path.indexOf('dist') + 4).replaceAll('\\', '/');
      this.plugin.get(relativePath, async () => {
        const fileContent = Bun.file(path);
        return new Response(fileContent.stream(), {
          headers: {
            'content-type': fileContent.type,
          },
        });
      });
    }

    return this.plugin.as('scoped');
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