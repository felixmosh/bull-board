import {
  AppControllerRoute,
  AppViewRoute,
  BullBoardQueues,
  ControllerHandlerReturnType,
  IServerAdapter,
  UIConfig,
} from '@bull-board/api/dist/typings/app';

import Koa from 'koa';
import mount from 'koa-mount';
import Router from 'koa-router';
import { bodyParser } from '@koa/bodyparser';
import serve from 'koa-static';
import views from 'koa-views';
import path from 'path';

export class KoaAdapter implements IServerAdapter {
  private basePath = '';
  private bullBoardQueues: BullBoardQueues | undefined;
  private errorHandler: ((error: Error) => ControllerHandlerReturnType) | undefined;
  private statics: { path: string; route: string } | undefined;
  private viewPath: string | undefined;
  private entryRoute: AppViewRoute | undefined;
  private apiRoutes: AppControllerRoute[] | undefined;
  private uiConfig: UIConfig = {};

  public setBasePath(path: string): KoaAdapter {
    this.basePath = path;
    return this;
  }

  public setStaticPath(staticsRoute: string, staticsPath: string): KoaAdapter {
    this.statics = { route: staticsRoute, path: staticsPath };

    return this;
  }

  public setViewsPath(viewPath: string): KoaAdapter {
    this.viewPath = viewPath;
    return this;
  }

  public setErrorHandler(handler: (error: Error) => ControllerHandlerReturnType) {
    this.errorHandler = handler;
    return this;
  }

  public setApiRoutes(routes: AppControllerRoute[]): KoaAdapter {
    this.apiRoutes = routes;

    return this;
  }

  public setEntryRoute(routeDef: AppViewRoute): KoaAdapter {
    this.entryRoute = routeDef;

    return this;
  }

  public setQueues(bullBoardQueues: BullBoardQueues): KoaAdapter {
    this.bullBoardQueues = bullBoardQueues;
    return this;
  }

  public setUIConfig(config: UIConfig = {}): KoaAdapter {
    this.uiConfig = config;
    return this;
  }

  public registerPlugin(options: Partial<{ mount: string }> = { mount: this.basePath }) {
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

    if (!options.mount) {
      options.mount = this.basePath;
    }

    const app = new Koa();
    const router = new Router({
      strict: true,
    });

    app.use(bodyParser());
    app.use(async (ctx, next) => {
      try {
        await next();
      } catch (err) {
        if (this.errorHandler) {
          const { status, body } = this.errorHandler(err as Error);

          ctx.status = status || 500;
          ctx.body = body;
          ctx.app.emit('error', err, ctx);
        }
      }
    });

    app.use(
      views(this.viewPath, {
        extension: path
          .extname(
            this.entryRoute.handler({ basePath: this.basePath, uiConfig: this.uiConfig }).name
          )
          .substring(1),
      })
    );

    const { method, route, handler } = this.entryRoute;
    const viewRoutes = Array.isArray(route) ? route : [route];
    viewRoutes.forEach((path) => {
      router[method](path, async (ctx) => {
        const { name, params } = handler({ basePath: this.basePath, uiConfig: this.uiConfig });

        await (ctx as any).render(name, params);
      });
    });

    app.use(mount(this.statics.route, serve(this.statics.path)));

    this.apiRoutes.forEach((route) => {
      const methods = Array.isArray(route.method) ? route.method : [route.method];
      methods.forEach((method) => {
        router[method](route.route, async (ctx) => {
          const response = await route.handler({
            queues: this.bullBoardQueues as any,
            params: ctx.params,
            query: ctx.query,
            body: ctx.request.body,
          });

          ctx.status = response.status || 200;
          return (ctx.body = response.body);
        });
      });
    });

    app.use(router.routes()).use(router.allowedMethods());

    return mount(options.mount || '/', app);
  }
}
