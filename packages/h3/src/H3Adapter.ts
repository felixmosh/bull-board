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
  private basePath = '/ui';
  private errorHandler: ((error: Error) => ControllerHandlerReturnType) | undefined;
  private bullBoardQueues: BullBoardQueues | undefined;
  private viewPath: string | undefined;
  private uiConfig: UIConfig = {};

  public setBasePath(path: string): H3Adapter {
    this.basePath = path;
    return this;
  }

  public setStaticPath(staticsRoute: string, staticsPath: string): H3Adapter {
    const getStaticPath = (relativePath: string) =>
      `${staticsPath}${relativePath.replace(`${this.basePath}${staticsRoute}`, '')}`;

    this.uiHandler.get(
      `${this.basePath}${staticsRoute}/**`,
      eventHandler(async (event) => {
        await serveStatic(event, {
          fallthrough: true,
          indexNames: undefined,
          getContents: (id) => readFileSync(getStaticPath(id)),
          getMeta: (id) => {
            const fileStat = statSync(getStaticPath(id));

            return {
              size: fileStat.size,
              type: getContentType(id),
            };
          },
        });
      })
    );

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
    routes.forEach(({ route, handler, method }) => {
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

    return this;
  }

  public setEntryRoute(routeDef: AppViewRoute): H3Adapter {
    const { method, route } = routeDef;
    const routes = Array.isArray(route) ? route : [route];

    routes.forEach((route) => {
      this.uiHandler.use(
        `${this.basePath}${route}`,
        eventHandler(async () => {
          return ejs.renderFile(this.viewPath + '/index.ejs', {
            basePath: `${this.basePath}/`,
            title: this.uiConfig.boardTitle ?? 'BullMQ',
            favIconAlternative: this.uiConfig.favIcon?.alternative ?? '',
            favIconDefault: this.uiConfig.favIcon?.default ?? '',
            uiConfig: JSON.stringify(this.uiConfig),
          });
        }),
        method
      );
    });

    return this;
  }

  public setQueues(bullBoardQueues: BullBoardQueues): H3Adapter {
    this.bullBoardQueues = bullBoardQueues;
    return this;
  }

  setUIConfig(config: UIConfig = {}): H3Adapter {
    this.uiConfig = config;

    return this;
  }

  public registerHandlers() {
    return this.uiHandler;
  }
}
