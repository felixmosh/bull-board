import {
  AppControllerRoute,
  AppViewRoute,
  BullBoardQueues,
  ControllerHandlerReturnType,
  IServerAdapter,
} from '@bull-board/api/dist/typings/app';
import { FastifyInstance } from 'fastify';
import pointOfView from 'point-of-view';

import fastifyStatic from 'fastify-static';
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
  private entryRoute: { method: HTTPMethods; routes: string[]; filename: string } | undefined;
  private apiRoutes: Array<FastifyRouteDef> | undefined;

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
    const { name } = routeDef.handler();

    this.entryRoute = {
      method: routeDef.method.toUpperCase() as HTTPMethods,
      routes: ([] as string[]).concat(routeDef.route),
      filename: name,
    };

    return this;
  }

  public setQueues(bullBoardQueues: BullBoardQueues): FastifyAdapter {
    this.bullBoardQueues = bullBoardQueues;
    return this;
  }

  public registerPlugin() {
    return (fastify: FastifyInstance, _opts: { basePath: string }, next: (err?: Error) => void) => {
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

      fastify.register(pointOfView, {
        engine: {
          ejs: require('ejs'),
        },
        root: this.viewPath,
      });

      fastify.register(fastifyStatic, {
        root: this.statics.path,
        prefix: this.statics.route,
      });

      const { method, routes, filename } = this.entryRoute;
      routes.forEach((url) =>
        fastify.route({
          method,
          url,
          handler: (_req, reply) => {
            reply.view(filename, {
              basePath: this.basePath,
            });
          },
        })
      );

      this.apiRoutes.forEach((route) => {
        fastify.route({
          method: route.method,
          url: route.route,
          handler: async (request, reply) => {
            const response = await route.handler({
              queues: this.bullBoardQueues as any,
              params: request.params as any,
              query: request.query as any,
            });

            reply.status(response.status || 200).send(response.body);
          },
        });
      });

      const errorHandler = this.errorHandler;

      fastify.setErrorHandler((error, _request, reply) => {
        const response = errorHandler(error);
        reply.status(response.status as 500).send(response.body);
      });

      next();
    };
  }
}

