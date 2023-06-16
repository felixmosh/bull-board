import path from 'path';
import { BoardOptions, IServerAdapter } from '../typings/app';
import { errorHandler } from './handlers/error';
import { BaseAdapter } from './queueAdapters/base';
import { getQueuesApi } from './queuesApi';
import { appRoutes } from './routes';

export function createBullBoard({
  queues,
  serverAdapter,
  options = { uiConfig: {} },
}: {
  queues: ReadonlyArray<BaseAdapter>;
  serverAdapter: IServerAdapter;
  options?: BoardOptions;
}) {
  const { bullBoardQueues, setQueues, replaceQueues, addQueue, removeQueue } = getQueuesApi(queues);
  const uiBasePath = options.uiBasePath || path.dirname(eval(`require.resolve('@bull-board/ui/package.json')`));

  serverAdapter
    .setQueues(bullBoardQueues)
    .setViewsPath(path.join(uiBasePath, 'dist'))
    .setStaticPath('/static', path.join(uiBasePath, 'dist/static'))
    .setPageTitle(options.pageTitle)
    .setUIConfig(options.uiConfig)
    .setEntryRoute(appRoutes.entryPoint)
    .setErrorHandler(errorHandler)
    .setApiRoutes(appRoutes.api);

  return { setQueues, replaceQueues, addQueue, removeQueue };
}
