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

  serverAdapter
    .setQueues(bullBoardQueues)
    .setViewsPath(path.resolve('node_modules/@bull-board/ui/dist'))
    .setStaticPath('/static', path.resolve('node_modules/@bull-board/ui/dist/static'))
    .setEntryRoute(appRoutes.entryPoint)
    .setErrorHandler(errorHandler)
    .setApiRoutes(appRoutes.api);

  return { setQueues, replaceQueues, addQueue, removeQueue };
}
