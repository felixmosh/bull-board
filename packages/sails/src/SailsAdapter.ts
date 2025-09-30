import type {
  AppControllerRoute,
  AppViewRoute,
  BullBoardQueues,
  ControllerHandlerReturnType,
  HTTPMethod,
  IServerAdapter,
  UIConfig,
} from '@bull-board/api/typings/app';
import ejs from 'ejs';
import express, { Express, Request, Response, Router } from 'express';
import { wrapAsync } from './helpers/wrapAsync';

export class SailsAdapter implements IServerAdapter {
  protected readonly app: Express;
  protected basePath = '';
  protected bullBoardQueues: BullBoardQueues | undefined;
  protected errorHandler: ((error: Error) => ControllerHandlerReturnType) | undefined;
  protected uiConfig: UIConfig = {};

  constructor() {
    this.app = express();
  }

  public setBasePath(path: string): SailsAdapter {
    this.basePath = path;
    return this;
  }

  public setStaticPath(staticsRoute: string, staticsPath: string): SailsAdapter {
    this.app.use(staticsRoute, express.static(staticsPath));

    return this;
  }

  public setViewsPath(viewPath: string): SailsAdapter {
    this.app.set('view engine', 'ejs').set('views', viewPath);
    this.app.engine('ejs', ejs.renderFile);

    return this;
  }

  public setErrorHandler(handler: (error: Error) => ControllerHandlerReturnType) {
    this.errorHandler = handler;
    return this;
  }

  public setApiRoutes(routes: AppControllerRoute[]): SailsAdapter {
    if (!this.errorHandler) {
      throw new Error(`Please call 'setErrorHandler' before using 'registerPlugin'`);
    } else if (!this.bullBoardQueues) {
      throw new Error(`Please call 'setQueues' before using 'registerPlugin'`);
    }
    const router = Router();
    router.use(express.json());

    routes.forEach((route) =>
      (Array.isArray(route.method) ? route.method : [route.method]).forEach(
        (method: HTTPMethod) => {
          router[method](
            route.route,
            wrapAsync(async (req: Request, res: Response) => {
              const response = await route.handler({
                queues: this.bullBoardQueues!,
                query: req.query,
                params: req.params,
                body: req.body,
                headers: req.headers as Record<string, string>,
              });

              res.status(response.status || 200).json(response.body);
            })
          );
        }
      )
    );

    router.use((err: Error, _req: Request, res: Response, next: any) => {
      if (!this.errorHandler) {
        return next();
      }

      const response = this.errorHandler(err);
      return res.status(response.status as 500).send(response.body);
    });

    this.app.use(router);
    return this;
  }

  public setEntryRoute(routeDef: AppViewRoute): SailsAdapter {
    const viewHandler = (_req: Request, res: Response) => {
      const { name, params } = routeDef.handler({
        basePath: this.basePath,
        uiConfig: this.uiConfig,
      });

      res.render(name, params);
    };

    this.app[routeDef.method](routeDef.route, viewHandler);
    return this;
  }

  public setQueues(bullBoardQueues: BullBoardQueues): SailsAdapter {
    this.bullBoardQueues = bullBoardQueues;
    return this;
  }

  setUIConfig(config: UIConfig = {}): SailsAdapter {
    this.uiConfig = config;
    return this;
  }

  public getRouter(): any {
    return this.app;
  }
}
