import { AppRouteDefs } from '../typings/app';
import { cleanAllHandler } from './handlers/cleanAll';
import { cleanJobHandler } from './handlers/cleanJob';
import { entryPoint } from './handlers/entryPoint';
import { jobLogsHandler } from './handlers/jobLogs';
import { pauseQueueHandler } from './handlers/pauseQueue';
import { promoteJobHandler } from './handlers/promotJob';
import { queuesHandler } from './handlers/queues';
import { redisStatsHandler } from './handlers/redisStats';
import { resumeQueueHandler } from './handlers/resumeQueue';
import { retryAllHandler } from './handlers/retryAll';
import { retryJobHandler } from './handlers/retryJob';

export const appRoutes: AppRouteDefs = {
  entryPoint: {
    method: 'get',
    route: ['/', '/queue/:queueName'],
    handler: entryPoint,
  },
  api: [
    { method: 'get', route: '/api/redis/stats', handler: redisStatsHandler },
    { method: 'get', route: '/api/queues', handler: queuesHandler },
    {
      method: 'get',
      route: '/api/queues/:queueName/:jobId/logs',
      handler: jobLogsHandler,
    },
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
      route: '/api/queues/:queueName/pause',
      handler: pauseQueueHandler,
    },
    {
      method: 'put',
      route: '/api/queues/:queueName/resume',
      handler: resumeQueueHandler,
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
  ],
};
