import {
  AppControllerRoute,
  AppViewRoute,
  BullBoardQueues,
  ControllerHandlerReturnType,
  IServerAdapter,
} from '@bull-board/api/dist/typings/app';
import { PluginBase, PluginPackage } from '@hapi/hapi';
import Vision from '@hapi/vision';
import Inert from '@hapi/inert';
import { toHapiPath } from './utils/toHapiPath';

type HapiRouteDef = {
  method: AppControllerRoute['method'];
  path: string;
  handler: AppControllerRoute['handler'];
};

export class HapiAdapter implements IServerAdapter {
  private basePath = '';
  private bullBoardQueues: BullBoardQueues | undefined;
  private errorHandler: ((error: Error) => ControllerHandlerReturnType) | undefined;
  private statics: { path: string; route: string } | undefined;
  private viewPath: string | undefined;
  private entryRoute: AppViewRoute | undefined;
  private apiRoutes: HapiRouteDef[] | undefined;

  public setBasePath(path: string): HapiAdapter {
    this.basePath = path;
    return this;
  }

  public setStaticPath(staticsRoute: string, staticsPath: string): HapiAdapter {
    this.statics = { route: staticsRoute, path: staticsPath };

    return this;
  }

  public setViewsPath(viewPath: string): HapiAdapter {
    this.viewPath = viewPath;
    return this;
  }

  public setErrorHandler(handler: (error: Error) => ControllerHandlerReturnType) {
    this.errorHandler = handler;
    return this;
  }

  public setApiRoutes(routes: AppControllerRoute[]): HapiAdapter {
    this.apiRoutes = routes.reduce((result, routeRaw) => {
      const routes = Array.isArray(routeRaw.route) ? routeRaw.route : [routeRaw.route];
      const methods = Array.isArray(routeRaw.method) ? routeRaw.method : [routeRaw.method];

      routes.forEach((path) => {
        result.push({
          method: methods.map((method) => method.toUpperCase()) as any,
          path: toHapiPath(path),
          handler: routeRaw.handler,
        });
      });

      return result;
    }, [] as HapiRouteDef[]);

    return this;
  }

  public setEntryRoute(routeDef: AppViewRoute): HapiAdapter {
    this.entryRoute = routeDef;

    return this;
  }

  public setQueues(bullBoardQueues: BullBoardQueues): HapiAdapter {
    this.bullBoardQueues = bullBoardQueues;
    return this;
  }

  public registerPlugin(): PluginBase<any> & PluginPackage {
    return {
      pkg: require('../package.json'),
      register: async (server) => {
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

        await server.register(Vision);

        server.views({
          engines: {
            ejs: require('ejs'),
          },
          path: this.viewPath,
        });

        await server.register(Inert);

        server.route({
          method: 'GET',
          path: `${this.statics.route}/{param*}`,
          handler: {
            directory: {
              path: this.statics.path,
            },
          },
        });

        const { method, route, handler } = this.entryRoute;
        const routes = Array.isArray(route) ? route : [route];

        routes.forEach((path) =>
          server.route({
            method: method.toUpperCase(),
            path: toHapiPath(path),
            handler: (_request, h) => {
              const { name } = handler();
              return h.view(name, { basePath: this.basePath });
            },
          })
        );

        const errorHandler = this.errorHandler;

        this.apiRoutes.forEach((route) => {
          server.route({
            method: route.method,
            path: route.path,
            handler: async (request, h) => {
              try {
                const response = await route.handler({
                  queues: this.bullBoardQueues as any,
                  params: request.params as any,
                  query: request.query as any,
                });

                return h.response(response.body).code(response.status || 200);
              } catch (e) {
                const response = errorHandler(e);
                return h.response(response.body).code(response.status as 500);
              }
            },
          });
        });
      },
    };
  }
}
