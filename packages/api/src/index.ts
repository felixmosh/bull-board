import path from 'path';
import { BoardOptions, IServerAdapter } from '../typings/app';
import { errorHandler } from './handlers/error';
import { wrapHandlerWithHooks } from './hooks';
import { BaseAdapter } from './queueAdapters/base';
import { getQueuesApi } from './queuesApi';
import { appRoutes, buildHistoryRoutes } from './routes';

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
  const hasLatencyHistory = Boolean(historyProvider?.getLatency);
  const readOnlyBoard = queues.length > 0 && queues.every((queue) => queue.readOnlyMode);
  const canPurgeHistory = Boolean(historyProvider?.purge) && !readOnlyBoard;

  const apiRoutes = [...appRoutes.api];
  if (historyProvider) {
    apiRoutes.push(
      ...buildHistoryRoutes(historyProvider, {
        hasUsage: hasHistoryUsage,
        canPurge: canPurgeHistory,
        hasLatency: hasLatencyHistory,
      })
    );
  }

  const finalApiRoutes = options.handlerHooks
    ? apiRoutes.map((route) => ({
        ...route,
        handler: wrapHandlerWithHooks(route, options.handlerHooks!),
      }))
    : apiRoutes;

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
      hasLatencyHistory,
    })
    .setEntryRoute(appRoutes.entryPoint)
    .setErrorHandler(errorHandler)
    .setApiRoutes(finalApiRoutes);

  return { setQueues, replaceQueues, addQueue, removeQueue };
}
