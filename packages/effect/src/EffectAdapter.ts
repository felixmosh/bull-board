import type {
  AppControllerRoute,
  AppViewRoute,
  BullBoardQueues,
  ControllerHandlerReturnType,
  HTTPMethod,
  IServerAdapter,
  UIConfig,
} from '@bull-board/api/typings/app';
import { Effect, Layer } from 'effect';
import { HttpRouter, HttpServerRequest, HttpServerResponse, HttpStaticServer } from 'effect/http';
import ejs from 'ejs';

const toArray = <T>(value: T | readonly T[]): readonly T[] =>
  Array.isArray(value) ? value : [value as T];

export class EffectAdapter implements IServerAdapter {
  private basePath = '';
  private bullBoardQueues: BullBoardQueues | undefined;
  private errorHandler: ((error: Error) => ControllerHandlerReturnType) | undefined;
  private uiConfig: UIConfig = {};
  private staticRoute?: string;
  private staticPath?: string;
  private viewPath?: string;
  private entryRoute?: AppViewRoute;
  private apiRoutes: AppControllerRoute[] = [];

  public setBasePath(path: string): this {
    this.basePath = path === '/' ? '' : path.replace(/\/+$/, '');
    return this;
  }

  public setStaticPath(staticRoute: string, staticPath: string): this {
    this.staticRoute = staticRoute;
    this.staticPath = staticPath;
    return this;
  }

  public setViewsPath(viewPath: string): this {
    this.viewPath = viewPath;
    return this;
  }

  public setErrorHandler(handler: (error: Error) => ControllerHandlerReturnType): this {
    this.errorHandler = handler;
    return this;
  }

  public setApiRoutes(routes: readonly AppControllerRoute[]): this {
    this.apiRoutes = [...routes];
    return this;
  }

  public setEntryRoute(routeDef: AppViewRoute): this {
    this.entryRoute = routeDef;
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

  /**
   * Returns a Layer that adds the board's routes to the application's `HttpRouter`.
   * Static assets are served through `HttpStaticServer`, so the platform layer
   * (e.g. `NodeHttpServer.layer` or `BunHttpServer.layer`) must be provided.
   */
  public registerPlugin() {
    const { staticRoute, staticPath, entryRoute, viewPath, bullBoardQueues, errorHandler } = this;
    if (!staticRoute || !staticPath) {
      throw new Error(`Please call 'setStaticPath' before using 'registerPlugin'`);
    } else if (!entryRoute) {
      throw new Error(`Please call 'setEntryRoute' before using 'registerPlugin'`);
    } else if (!viewPath) {
      throw new Error(`Please call 'setViewsPath' before using 'registerPlugin'`);
    } else if (!bullBoardQueues || !errorHandler) {
      throw new Error(`Please call 'createBullBoard' before using 'registerPlugin'`);
    }

    const api = HttpRouter.use((router) =>
      Effect.forEach(this.apiRoutes, (route) =>
        Effect.forEach(toArray(route.method), (method) =>
          Effect.forEach(toArray(route.route), (path) =>
            router.add(
              method.toUpperCase() as Uppercase<HTTPMethod>,
              this.fullPath(path),
              this.apiHandler(route, method, bullBoardQueues, errorHandler)
            )
          )
        )
      )
    );

    const entry = HttpRouter.use((router) =>
      Effect.forEach(toArray(entryRoute.route), (route) =>
        router.add(
          entryRoute.method.toUpperCase() as Uppercase<HTTPMethod>,
          this.entryPath(route),
          this.entryHandler(entryRoute, viewPath)
        )
      )
    );

    const assets = HttpStaticServer.layer({
      root: staticPath,
      prefix: this.fullPath(staticRoute),
    });

    return Layer.mergeAll(api, entry, assets);
  }

  private fullPath(route: string): `/${string}` {
    return `${this.basePath}${route}` as `/${string}`;
  }

  // The router ignores trailing slashes, so `/ui` also answers `/ui/`.
  private entryPath(route: string): `/${string}` {
    return route === '/' && this.basePath ? (this.basePath as `/${string}`) : this.fullPath(route);
  }

  private entryHandler(entryRoute: AppViewRoute, viewPath: string) {
    const { basePath, uiConfig } = this;
    return Effect.gen(function* () {
      const { name, params } = entryRoute.handler({ basePath: basePath || '/', uiConfig });
      const html = yield* Effect.promise(() => ejs.renderFile(`${viewPath}/${name}`, params));
      return HttpServerResponse.html(html);
    });
  }

  private apiHandler(
    route: AppControllerRoute,
    method: HTTPMethod,
    queues: BullBoardQueues,
    errorHandler: (error: Error) => ControllerHandlerReturnType
  ) {
    const { uiConfig } = this;
    return Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const params = yield* HttpRouter.params;
      // The UI sends most requests without a body, so a missing or invalid one is `{}`.
      const body =
        method === 'get' ? {} : yield* request.json.pipe(Effect.orElseSucceed(() => ({})));
      const query = Object.fromEntries(new URL(request.url, 'http://localhost').searchParams);

      return yield* Effect.tryPromise({
        try: async () =>
          route.handler({
            queues,
            uiConfig,
            params,
            query,
            body: body as Record<string, unknown>,
            headers: { ...request.headers },
          }),
        catch: (error) => error,
      }).pipe(
        Effect.map(toResponse),
        Effect.catch((error) => {
          if (!(error instanceof Error)) return Effect.die(error);
          const response = errorHandler(error);
          return Effect.succeed(
            toResponse({ ...response, status: response.status !== 204 ? response.status : 500 })
          );
        })
      );
    });
  }
}

function toResponse({ status = 200, body }: ControllerHandlerReturnType) {
  if (status === 204) return HttpServerResponse.empty({ status });
  return typeof body === 'string'
    ? HttpServerResponse.text(body, { status })
    : HttpServerResponse.jsonUnsafe(body, { status });
}
