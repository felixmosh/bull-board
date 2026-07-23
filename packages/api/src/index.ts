import path from 'path';
import { BoardOptions, IServerAdapter } from '../typings/app';
import { errorHandler } from './handlers/error';
import { createMetricsHistoryHandler } from './handlers/metricsHistory';
import {
  createMetricsHistoryPurgeHandler,
  createMetricsHistoryUsageHandler,
} from './handlers/metricsHistoryStorage';
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

  const historyProvider = options.historyProvider;
  // Optional provider capabilities: a route only exists when the provider implements it.
  // Purging is destructive, so it additionally requires a board that isn't read-only.
  // `readOnlyMode` is per-queue here, so a board is read-only when every queue is; queues
  // registered later can't loosen that, matching how the other derived flags are fixed at
  // creation time.
  const hasHistoryUsage = Boolean(historyProvider?.getUsage);
  const readOnlyBoard = queues.length > 0 && queues.every((queue) => queue.readOnlyMode);
  const canPurgeHistory = Boolean(historyProvider?.purge) && !readOnlyBoard;

  const apiRoutes = [...appRoutes.api];
  if (historyProvider) {
    apiRoutes.push({
      method: 'get',
      route: '/api/metrics/history',
      handler: createMetricsHistoryHandler(historyProvider),
    });
    if (hasHistoryUsage) {
      apiRoutes.push({
        method: 'get',
        route: '/api/metrics/history/usage',
        handler: createMetricsHistoryUsageHandler(historyProvider),
      });
    }
    if (canPurgeHistory) {
      apiRoutes.push({
        method: 'post',
        route: '/api/metrics/history/purge',
        handler: createMetricsHistoryPurgeHandler(historyProvider),
      });
    }
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
      ...options.uiConfig,
      // Derived from `historyProvider`, so these must win over any caller-supplied
      // uiConfig: each flag gates a UI feature whose backing route only exists when the
      // provider supports it.
      hasHistoryProvider: Boolean(historyProvider),
      hasHistoryUsage,
      canPurgeHistory,
    })
    .setEntryRoute(appRoutes.entryPoint)
    .setErrorHandler(errorHandler)
    .setApiRoutes(apiRoutes);

  return { setQueues, replaceQueues, addQueue, removeQueue };
}
