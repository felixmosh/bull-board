import {
  AppControllerRoute,
  AppViewRoute,
  BullBoardQueues,
  ControllerHandlerReturnType,
  HTTPMethod,
  IServerAdapter,
  UIConfig,
} from '@bull-board/api/dist/typings/app';
import ejs from 'ejs';
import express, { Express, Request, Response, Router } from 'express';
import { wrapAsync } from './helpers/wrapAsync';
import querystring from 'querystring';

export class ExpressAdapter implements IServerAdapter {
  protected readonly app: Express;
  protected basePath = '';
  protected bullBoardQueues: BullBoardQueues | undefined;
  protected errorHandler: ((error: Error) => ControllerHandlerReturnType) | undefined;
  protected uiConfig: UIConfig = {};

  constructor() {
    this.app = express();
  }

  public setBasePath(path: string): ExpressAdapter {
    this.basePath = path;
    return this;
  }

  public setStaticPath(staticsRoute: string, staticsPath: string): ExpressAdapter {
    this.app.use(staticsRoute, express.static(staticsPath));

    return this;
  }

  public setViewsPath(viewPath: string): ExpressAdapter {
    this.app.set('view engine', 'ejs').set('views', viewPath);
    this.app.engine('ejs', ejs.renderFile);

    return this;
  }

  public setErrorHandler(handler: (error: Error) => ControllerHandlerReturnType) {
    this.errorHandler = handler;
    return this;
  }

  public setApiRoutes(routes: AppControllerRoute[]): ExpressAdapter {
    if (!this.errorHandler) {
      throw new Error(`Please call 'setErrorHandler' before using 'registerPlugin'`);
    } else if (!this.bullBoardQueues) {
      throw new Error(`Please call 'setQueues' before using 'registerPlugin'`);
    }
    const router = Router();
    router.use(express.json());

    /** 
     * Parse query string manually if req.query is undefined. This is usually due to 
     * Express v5 changes or parent app having disabled query parser.
     * 
     * Workaround for: 
     * - https://github.com/felixmosh/bull-board/issues/883
     * - https://github.com/felixmosh/bull-board/issues/952
     */

    router.use((req, _res, next) => {

      if (req.query === undefined || req.query === null) {
        try {
          const queryString = req.url.split('?')[1] || '';
          req.query = querystring.parse(queryString);
        } catch (error) {
          req.query = {};
          console.error('[Bull Board] Failed to parse query string:', error);
        }
      }
      next();
    });

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
                body: req.body,
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

  public setEntryRoute(routeDef: AppViewRoute): ExpressAdapter {
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

  public setQueues(bullBoardQueues: BullBoardQueues): ExpressAdapter {
    this.bullBoardQueues = bullBoardQueues;
    return this;
  }

  setUIConfig(config: UIConfig = {}): ExpressAdapter {
    this.uiConfig = config;
    return this;
  }

  public getRouter(): any {
    return this.app;
  }
}
