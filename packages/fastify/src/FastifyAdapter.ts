import type {
  AppControllerRoute,
  AppViewRoute,
  BullBoardQueues,
  ControllerHandlerReturnType,
  IServerAdapter,
  UIConfig,
} from '@bull-board/api/dist/typings/app';

import fastifyStatic from '@fastify/static';
import pointOfView from '@fastify/view';
import ejs from 'ejs';
import { FastifyPluginCallback } from 'fastify';
import { HTTPMethods } from 'fastify/types/utils';

type FastifyRouteDef = {
  method: HTTPMethods;
  route: string;
  handler: AppControllerRoute['handler'];
};

export class FastifyAdapter implements IServerAdapter {
  private basePath = '';
  private bullBoardQueues: BullBoardQueues | undefined;
  private errorHandler: ((error: Error) => ControllerHandlerReturnType) | undefined;
  private statics: { path: string; route: string } | undefined;
  private viewPath: string | undefined;
  private entryRoute:
    | { method: HTTPMethods; routes: string[]; handler: AppViewRoute['handler'] }
    | undefined;
  private apiRoutes: Array<FastifyRouteDef> | undefined;
  private uiConfig: UIConfig = {};

  public setBasePath(path: string): FastifyAdapter {
    this.basePath = path;
    return this;
  }

  public setStaticPath(staticsRoute: string, staticsPath: string): FastifyAdapter {
    this.statics = { route: staticsRoute, path: staticsPath };

    return this;
  }

  public setViewsPath(viewPath: string): FastifyAdapter {
    this.viewPath = viewPath;
    return this;
  }

  public setErrorHandler(handler: (error: Error) => ControllerHandlerReturnType) {
    this.errorHandler = handler;
    return this;
  }

  public setApiRoutes(routes: AppControllerRoute[]): FastifyAdapter {
    this.apiRoutes = routes.reduce((result, routeRaw) => {
      const routes = Array.isArray(routeRaw.route) ? routeRaw.route : [routeRaw.route];
      const methods = Array.isArray(routeRaw.method) ? routeRaw.method : [routeRaw.method];

      routes.forEach((route) => {
        result.push({
          method: methods.map((method) => method.toUpperCase()) as unknown as HTTPMethods,
          route,
          handler: routeRaw.handler,
        });
      });

      return result;
    }, [] as FastifyRouteDef[]);
    return this;
  }

  public setEntryRoute(routeDef: AppViewRoute): FastifyAdapter {
    this.entryRoute = {
      method: routeDef.method.toUpperCase() as HTTPMethods,
      routes: ([] as string[]).concat(routeDef.route),
      handler: routeDef.handler,
    };

    return this;
  }

  public setQueues(bullBoardQueues: BullBoardQueues): FastifyAdapter {
    this.bullBoardQueues = bullBoardQueues;
    return this;
  }

  public setUIConfig(config: UIConfig = {}): FastifyAdapter {
    this.uiConfig = config;
    return this;
  }

  public registerPlugin(): FastifyPluginCallback {
    return (fastify, opts: { prefix?: string }, done) => {
      if (!this.statics) {
        throw new Error(`Please call 'setStaticPath' before using 'registerPlugin'`);
      } else if (!this.entryRoute) {
        throw new Error(`Please call 'setEntryRoute' before using 'registerPlugin'`);
      } else if (!this.viewPath) {
        throw new Error(`Please call 'setViewsPath' before using 'registerPlugin'`);
      } else if (!this.apiRoutes) {
        throw new Error(`Please call 'setApiRoutes' before using 'registerPlugin'`);
      } else if (!this.bullBoardQueues) {
        throw new Error(`Please call 'setQueues' before using 'registerPlugin'`);
      } else if (!this.errorHandler) {
        throw new Error(`Please call 'setErrorHandler' before using 'registerPlugin'`);
      }

      if (!!opts.prefix && !this.basePath) {
        this.setBasePath(opts.prefix);
      }

      fastify.register(pointOfView, {
        engine: {
          ejs,
        },
        root: this.viewPath,
      });

      fastify.register(fastifyStatic, {
        root: this.statics.path,
        prefix: this.statics.route,
      });

      const { method, routes, handler } = this.entryRoute;
      routes.forEach((url) =>
        fastify.route({
          method,
          url,
          schema: {
            hide: true,
          } as any,
          handler: (_req, reply) => {
            const { name, params } = handler({ basePath: this.basePath, uiConfig: this.uiConfig });

            return reply.view(name, params);
          },
        })
      );

      this.apiRoutes.forEach((route) => {
        fastify.route({
          method: route.method,
          url: route.route,
          schema: {
            hide: true,
          } as any,
          handler: async (request, reply) => {
            const response = await route.handler({
              queues: this.bullBoardQueues!,
              params: request.params as Record<string, unknown>,
              query: request.query as Record<string, unknown>,
              body: request.body as Record<string, unknown>,
              headers: request.headers as Record<string, string>,
            });

            return reply.status(response.status || 200).send(response.body);
          },
        });
      });

      const errorHandler = this.errorHandler;

      fastify.setErrorHandler((error, _request, reply) => {
        const response = errorHandler(error);
        return reply.status(response.status || 500).send(response.body);
      });

      done();
    };
  }
}
