import { AppRouteDefs } from '../typings/app';
import { entryPoint } from './handlers/entryPoint';
import { queuesHandler } from './handlers/queues';
import { retryAllHandler } from './handlers/retryAll';
import { cleanAllHandler } from './handlers/cleanAll';
import { retryJobHandler } from './handlers/retryJob';
import { cleanJobHandler } from './handlers/cleanJob';
import { promoteJobHandler } from './handlers/promotJob';
import { jobLogsHandler } from './handlers/jobLogs';

export const appRoutes: AppRouteDefs = {
  entryPoint: {
    method: 'get',
    route: ['/', '/queue/:queueName'],
    handler: entryPoint,
  },
  api: [
    { method: 'get', route: '/api/queues', handler: queuesHandler },
    {
      method: 'put',
      route: '/api/queues/:queueName/retry',
      handler: retryAllHandler,
    },
    {
      method: 'put',
      route: '/api/queues/:queueName/clean/:queueStatus',
      handler: cleanAllHandler,
    },
    {
      method: 'put',
      route: '/api/queues/:queueName/:jobId/retry',
      handler: retryJobHandler,
    },
    {
      method: 'put',
      route: '/api/queues/:queueName/:jobId/clean',
      handler: cleanJobHandler,
    },
    {
      method: 'put',
      route: '/api/queues/:queueName/:jobId/promote',
      handler: promoteJobHandler,
    },
    {
      method: 'get',
      route: '/api/queues/:queueName/:jobId/logs',
      handler: jobLogsHandler,
    },
  ],
};
