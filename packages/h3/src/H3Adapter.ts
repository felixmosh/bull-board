import {
  AppControllerRoute,
  AppViewRoute,
  BullBoardQueues,
  ControllerHandlerReturnType,
  IServerAdapter,
  UIConfig,
} from '@bull-board/api/dist/typings/app';
import { readFileSync, statSync } from 'fs';
import {
  createRouter,
  eventHandler,
  getRouterParams,
  getQuery,
  serveStatic,
  createError,
} from 'h3';
import ejs from 'ejs';
import { getContentType } from './utils/getContentType';

export class H3Adapter implements IServerAdapter {
  private uiHandler = createRouter();
  private basePath = '';
  private entryRoute: AppViewRoute | undefined;
  private apiRoutes: AppControllerRoute[] | undefined;
  private statics: { path: string; route: string } | undefined;
  private errorHandler: ((error: Error) => ControllerHandlerReturnType) | undefined;
  private bullBoardQueues: BullBoardQueues | undefined;
  private viewPath: string | undefined;
  private uiConfig: UIConfig = {};

  public setBasePath(path: string): H3Adapter {
    this.basePath = path;
    return this;
  }

  public setStaticPath(staticsRoute: string, staticsPath: string): H3Adapter {
    this.statics = { route: staticsRoute, path: staticsPath };

    return this;
  }

  public setViewsPath(viewPath: string): H3Adapter {
    this.viewPath = viewPath;

    return this;
  }

  public setErrorHandler(handler: (error: Error) => ControllerHandlerReturnType) {
    this.errorHandler = handler;

    return this;
  }

  public setApiRoutes(routes: AppControllerRoute[]): H3Adapter {
    this.apiRoutes = routes;

    return this;
  }

  public setEntryRoute(routeDef: AppViewRoute): H3Adapter {
    this.entryRoute = routeDef;

    return this;
  }

  public setQueues(bullBoardQueues: BullBoardQueues): H3Adapter {
    this.bullBoardQueues = bullBoardQueues;
    return this;
  }

  public setUIConfig(config: UIConfig = {}): H3Adapter {
    this.uiConfig = config;

    return this;
  }

  public registerHandlers() {
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

    const getStaticPath = (relativePath: string) => {
      if (!this.statics) return '';

      return `${this.statics.path}${relativePath.replace(
        `${this.basePath}${this.statics.route}`,
        ''
      )}`;
    };

    const { method, route, handler } = this.entryRoute;

    const routes = Array.isArray(route) ? route : [route];

    routes.forEach((route) => {
      this.uiHandler.use(
        `${this.basePath}${route}`,
        eventHandler(async () => {
          const { name: filename, params } = handler({
            basePath: this.basePath,
            uiConfig: this.uiConfig,
          });

          return ejs.renderFile(`${this.viewPath}/${filename}`, params);
        }),
        method
      );
    });

    this.uiHandler.get(
      `${this.basePath}${this.statics.route}/**`,
      eventHandler(async (event) => {
        return await serveStatic(event, {
          fallthrough: false,
          indexNames: undefined,
          getContents: (id) => readFileSync(getStaticPath(id)),
          getMeta: (id) => {
            try {
              const fileStat = statSync(getStaticPath(id));

              return {
                size: fileStat.size,
                type: getContentType(id),
              };
            } catch (e) {
              return undefined;
            }
          },
        });
      })
    );

    this.apiRoutes.forEach(({ route, handler, method }) => {
      this.uiHandler.use(
        `${this.basePath}${route}`,
        eventHandler(async (event) => {
          try {
            const { body } = await handler({
              queues: this.bullBoardQueues as BullBoardQueues,
              params: getRouterParams(event),
              query: getQuery(event),
            });

            return body;
          } catch (e) {
            if (this.errorHandler) {
              const { body, status } = this.errorHandler(e as Error);

              return createError({
                statusCode: status,
                data: body,
              });
            }
          }
        }),
        method
      );
    });

    return this.uiHandler;
  }
}
