import express, {
  Express,
  NextFunction,
  Request,
  Response,
  Router,
} from 'express';
import {
  AppControllerRoute,
  AppViewRoute,
  BullBoardQueues,
  ControllerHandlerReturnType,
  HTTPMethod,
  IServerAdapter,
} from '@bull-board/api/typings/app';
import { wrapAsync } from './helpers/wrapAsync';

export class ExpressAdapter implements IServerAdapter {
  private readonly app: Express;
  private basePath = '';
  private bullBoardQueues: BullBoardQueues | undefined;
  private errorHandler:
    | ((error: Error) => ControllerHandlerReturnType)
    | undefined;

  constructor() {
    this.app = express();
  }

  public setBasePath(path: string): ExpressAdapter {
    this.basePath = path;
    return this;
  }

  public setStaticPath(
    staticsRoute: string,
    staticsPath: string
  ): ExpressAdapter {
    this.app.use(staticsRoute, express.static(staticsPath));

    return this;
  }

  public setViewsPath(viewPath: string): ExpressAdapter {
    this.app.set('view engine', 'ejs').set('views', viewPath);
    return this;
  }

  public setErrorHandler(
    handler: (error: Error) => ControllerHandlerReturnType
  ) {
    this.errorHandler = handler;
    return this;
  }

  public setApiRoutes(routes: AppControllerRoute[]): ExpressAdapter {
    if (typeof this.bullBoardQueues === 'undefined') {
      throw new Error(
        'You should first initialize queues by calling `setQueues()`'
      );
    }
    const router = Router();

    routes.forEach((route) =>
      (Array.isArray(route.method) ? route.method : [route.method]).forEach(
        (method: HTTPMethod) => {
          router[method](
            route.route,
            wrapAsync(async (req: Request, res: Response) => {
              const response = await route.handler({
                queues: this.bullBoardQueues as BullBoardQueues,
                query: req.query,
                params: req.params,
              });

              res.status(response.status || 200).json(response.body);
            })
          );
        }
      )
    );

    router.use(
      (err: Error, _req: Request, res: Response, next: NextFunction) => {
        if (!this.errorHandler) {
          return next();
        }

        const response = this.errorHandler(err);
        return res.status(response.status as 500).send(response.body);
      }
    );

    this.app.use(router);
    return this;
  }

  public setEntryRoute(routeDef: AppViewRoute): ExpressAdapter {
    const viewHandler = (_req: Request, res: Response) => {
      const { name } = routeDef.handler();

      res.render(name, { basePath: this.basePath });
    };

    (Array.isArray(routeDef.method)
      ? routeDef.method
      : [routeDef.method]
    ).forEach((method: HTTPMethod) =>
      this.app[method](routeDef.route, viewHandler)
    );
    return this;
  }

  public setQueues(bullBoardQueues: BullBoardQueues): ExpressAdapter {
    this.bullBoardQueues = bullBoardQueues;
    return this;
  }

  public getRouter(): any {
    return this.app;
  }
}
