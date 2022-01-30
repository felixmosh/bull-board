import {
  AppControllerRoute,
  AppViewRoute,
  BullBoardQueues,
  ControllerHandlerReturnType,
  HTTPMethod,
  IServerAdapter,
} from '@bull-board/api/dist/typings/app';
import {
  DefaultRequestBody,
  MockedRequest,
  rest,
  RestHandler,
  setupWorker,
  SetupWorkerApi,
} from 'msw';
import { parse } from 'qs';

export class MSWAdapter implements IServerAdapter {
  private queues: BullBoardQueues | undefined;
  private worker: SetupWorkerApi | undefined;
  private readonly mockHandlers: RestHandler<MockedRequest<DefaultRequestBody>>[] = [];

  public setApiRoutes(routes: AppControllerRoute[]): IServerAdapter {
    routes.forEach((route) => {
      ([] as HTTPMethod[]).concat(route.method).forEach((method) => {
        ([] as string[]).concat(route.route).forEach((routePath) => {
          const mockHandler = rest[method](routePath, async (req, res, ctx) => {
            const { status, body } = await route.handler({
              queues: this.queues as BullBoardQueues,
              query: parse(req.url.search),
              params: req.params,
            });
            ctx.fetch;
            return res(ctx.status(status || 200), ctx.json(body));
          });

          this.mockHandlers.push(mockHandler);
        });
      });
    });

    return this;
  }

  public setEntryRoute(route: AppViewRoute): IServerAdapter {
    ([] as string[]).concat(route.route).forEach((routePath) => {
      const mockHandler = rest[route.method](routePath, async (req, res, ctx) => {
        const realResp = await ctx.fetch(req);
        return res(ctx.status(realResp.status), ctx.text(await realResp.text()));
      });
      this.mockHandlers.push(mockHandler);
    });
    return this;
  }

  public setErrorHandler(_handler: (error: Error) => ControllerHandlerReturnType): IServerAdapter {
    return this;
  }

  public setQueues(bullBoardQueues: BullBoardQueues): IServerAdapter {
    this.queues = bullBoardQueues;
    return this;
  }

  public setStaticPath(_staticsRoute: string, _staticsPath: string): IServerAdapter {
    return this;
  }

  public setViewsPath(_viewPath: string): IServerAdapter {
    return this;
  }

  public init() {
    this.worker = setupWorker(...this.mockHandlers);
    this.worker?.printHandlers();
    return this.worker?.start();
  }
}
