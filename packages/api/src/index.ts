import { BaseAdapter } from './queueAdapters/base';
import { IServerAdapter } from '../typings/app';
import { getQueuesApi } from './queuesApi';
import path from 'path';
import { appRoutes } from './routes';
import { errorHandler } from './handlers/error';

export function createBullBoard({
  queues,
  serverAdapter,
}: {
  queues: ReadonlyArray<BaseAdapter>;
  serverAdapter: IServerAdapter;
}) {
  const { bullBoardQueues, setQueues, replaceQueues, addQueue, removeQueue } = getQueuesApi(queues);
  const uiBasePath = path.dirname(require.resolve('@bull-board/ui/package.json'));

  serverAdapter
    .setQueues(bullBoardQueues)
    .setViewsPath(path.join(uiBasePath, 'dist'))
    .setStaticPath('/static', path.join(uiBasePath, 'dist/static'))
    .setEntryRoute(appRoutes.entryPoint)
    .setErrorHandler(errorHandler)
    .setApiRoutes(appRoutes.api);

  return { setQueues, replaceQueues, addQueue, removeQueue };
}
