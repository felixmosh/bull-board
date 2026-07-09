import path from 'path';
import { BoardOptions, IServerAdapter } from '../typings/app';
import { errorHandler } from './handlers/error';
import { createMetricsHistoryHandler } from './handlers/metricsHistory';
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
  const uiBasePath =
    // oxlint-disable-next-line no-eval
    options.uiBasePath || path.dirname(eval(`require.resolve('@bull-board/ui/package.json')`));

  const apiRoutes = [...appRoutes.api];
  if (options.historyProvider) {
    apiRoutes.push({
      method: 'get',
      route: '/api/metrics/history',
      handler: createMetricsHistoryHandler(options.historyProvider),
    });
  }

  serverAdapter
    .setQueues(bullBoardQueues)
    .setViewsPath(path.join(uiBasePath, 'dist'))
    .setStaticPath('/static', path.join(uiBasePath, 'dist/static'))
    .setUIConfig({
      boardTitle: 'Bull Dashboard',
      favIcon: {
        default: 'static/images/logo.svg',
        alternative: 'static/favicon-32x32.png',
      },
      hasHistoryProvider: Boolean(options.historyProvider),
      ...options.uiConfig,
    })
    .setEntryRoute(appRoutes.entryPoint)
    .setErrorHandler(errorHandler)
    .setApiRoutes(apiRoutes);

  return { setQueues, replaceQueues, addQueue, removeQueue };
}
