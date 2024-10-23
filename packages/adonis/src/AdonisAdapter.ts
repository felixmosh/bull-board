import { readFileSync } from 'fs';
import ejs from 'ejs';
import mime from 'mime';

import {
  AppControllerRoute,
  AppViewRoute,
  BullBoardQueues,
  ControllerHandlerReturnType,
  HTTPMethod,
  IServerAdapter,
  UIConfig,
} from '@bull-board/api/dist/typings/app.js';

import { MiddlewareFn, OneOrMore, ParsedNamedMiddleware } from '@adonisjs/core/types/http';
import { HttpRouterService } from '@adonisjs/core/types';
import type { HttpContext } from '@adonisjs/core/http';

export class AdonisAdapter implements IServerAdapter {
  protected basePath = '';
  protected bullBoardQueues: BullBoardQueues | undefined;
  protected errorHandler: ((error: Error) => ControllerHandlerReturnType) | undefined;
  protected uiConfig: UIConfig = {};
  private viewPath: string | undefined;
  private statics?: { path: string; route: string };
  private middlewares!: OneOrMore<MiddlewareFn | ParsedNamedMiddleware>;
  private router: HttpRouterService;

  constructor(router: HttpRouterService) {
    this.router = router;
  }

  public use(middlewares: OneOrMore<MiddlewareFn | ParsedNamedMiddleware>): this {
    this.middlewares = middlewares;
    return this;
  }

  public setBasePath(path: string): this {
    this.basePath = path;
    return this;
  }

  public setStaticPath(staticsRoute: string, staticsPath: string): this {
    this.statics = { route: staticsRoute, path: staticsPath };
    return this;
  }

  public setViewsPath(viewPath: string): this {
    this.viewPath = viewPath;
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

  public setErrorHandler(handler: (error: Error) => ControllerHandlerReturnType) {
    this.errorHandler = handler;
    return this;
  }

  public setApiRoutes(routes: AppControllerRoute[]): this {
    this.router
      .group(() => {
        routes.forEach((route) =>
          (Array.isArray(route.method) ? route.method : [route.method]).forEach(
            (method: HTTPMethod) => {
              this.router[method](route.route.toString(), async (ctx: HttpContext) => {
                const response = await route.handler({
                  queues: this.bullBoardQueues as BullBoardQueues,
                  query: ctx.request.qs(),
                  params: ctx.request.params(),
                  body: ctx.request.body(),
                });

                return ctx.response.status(response.status || 200).json(response.body);
              });
            }
          )
        );
      })
      .use(this.middlewares)
      .prefix(this.basePath);

    return this;
  }

  public setEntryRoute(routeDef: AppViewRoute): this {
    const { method, route, handler } = routeDef;

    const routes = Array.isArray(route) ? route : [route];

    this.router
      .group(() => {
        routes.forEach((singleRoute) => {
          const { name: filename, params } = handler({
            basePath: this.basePath,
            uiConfig: this.uiConfig,
          });

          this.router[method](singleRoute, () => {
            return ejs.renderFile(`${this.viewPath}/${filename}`, params);
          });
        });

        if (this.statics) {
          const statics = this.statics;
          this.router.get(`${statics.route}/*`, (ctx: HttpContext) => {
            try {
              const param = ctx.request.param('*');

              const filePath = `${statics.path}/${param.join('/')}`;

              const fileContents = readFileSync(filePath);
              const contentType = mime.getType(filePath);
              if (contentType) {
                ctx.response.safeHeader('content-type', contentType);
              }

              return ctx.response.status(200).send(fileContents);
            } catch (e) {
              return undefined;
            }
          });
        }
      })
      .use(this.middlewares)
      .prefix(this.basePath);

    return this;
  }
}
