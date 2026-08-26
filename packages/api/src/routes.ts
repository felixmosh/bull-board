import { AppRouteDefs } from '../typings/app';
import { addJobHandler } from './handlers/addJob';
import { cleanAllHandler } from './handlers/cleanAll';
import { cleanJobHandler } from './handlers/cleanJob';
import { defaultJobOptionsHandler } from './handlers/defaultJobOptions';
import { changeJobDelayHandler, changeJobPriorityHandler } from './handlers/editJob';
import { emptyQueueHandler } from './handlers/emptyQueue';
import { entryPoint } from './handlers/entryPoint';
import { jobHandler } from './handlers/job';
import { jobDataSchemaHandler } from './handlers/jobDataSchema';
import { jobFlowHandler } from './handlers/jobFlow';
import { jobLogsHandler } from './handlers/jobLogs';
import { jobSchedulersHandler } from './handlers/jobSchedulers';
import { metricsHandler } from './handlers/metrics';
import { obliterateQueueHandler } from './handlers/obliterateQueue';
import { pauseAllHandler } from './handlers/pauseAll';
import { pauseQueueHandler } from './handlers/pauseQueue';
import { promoteAllHandler } from './handlers/promoteAll';
import { promoteJobHandler } from './handlers/promotJob';
import { queuesHandler } from './handlers/queues';
import { queueWorkersHandler } from './handlers/queueWorkers';
import { redisStatsHandler } from './handlers/redisStats';
import { removeJobSchedulerHandler } from './handlers/removeJobScheduler';
import { resumeAllHandler } from './handlers/resumeAll';
import { resumeQueueHandler } from './handlers/resumeQueue';
import { retryAllHandler } from './handlers/retryAll';
import { retryJobHandler } from './handlers/retryJob';
import { setGlobalConcurrencyHandler } from './handlers/setGlobalConcurrency';
import { updateJobDataHandler } from './handlers/updateJobData';
import { updateJobSchedulerHandler } from './handlers/updateJobScheduler';

export const appRoutes: AppRouteDefs = {
  entryPoint: {
    method: 'get',
    route: [
      '/',
      '/metrics-history',
      '/job-schedulers',
      '/queue/:queueName',
      '/queue/:queueName/:jobId',
    ],
    handler: entryPoint,
  },
  api: [
    { method: 'get', route: '/api/redis/stats', handler: redisStatsHandler },
    { method: 'get', route: '/api/queues', handler: queuesHandler },
    { method: 'get', route: '/api/job-schedulers', handler: jobSchedulersHandler },
    {
      method: 'get',
      route: '/api/queues/:queueName/metrics',
      handler: metricsHandler,
    },
    {
      method: 'get',
      route: '/api/queues/:queueName/default-job-options',
      handler: defaultJobOptionsHandler,
    },
    {
      method: 'get',
      route: '/api/queues/:queueName/workers',
      handler: queueWorkersHandler,
    },
    {
      method: 'get',
      route: '/api/queues/:queueName/job-data-schema',
      handler: jobDataSchemaHandler,
    },
    { method: 'put', route: '/api/queues/pause', handler: pauseAllHandler },
    { method: 'put', route: '/api/queues/resume', handler: resumeAllHandler },
    {
      method: 'get',
      route: '/api/queues/:queueName/:jobId/logs',
      handler: jobLogsHandler,
    },
    {
      method: 'get',
      route: '/api/queues/:queueName/:jobId/flow',
      handler: jobFlowHandler,
    },
    {
      method: 'get',
      route: '/api/queues/:queueName/:jobId',
      handler: jobHandler,
    },
    {
      method: 'post',
      route: '/api/queues/:queueName/add',
      handler: addJobHandler,
    },
    {
      method: 'put',
      route: '/api/queues/:queueName/retry/:queueStatus',
      handler: retryAllHandler,
    },
    {
      method: 'put',
      route: '/api/queues/:queueName/promote',
      handler: promoteAllHandler,
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
      route: '/api/queues/:queueName/concurrency',
      handler: setGlobalConcurrencyHandler,
    },
    {
      method: 'put',
      route: '/api/queues/:queueName/empty',
      handler: emptyQueueHandler,
    },
    {
      method: 'put',
      route: '/api/queues/:queueName/obliterate',
      handler: obliterateQueueHandler,
    },
    {
      method: 'put',
      route: '/api/queues/:queueName/job-schedulers/:schedulerId/remove',
      handler: removeJobSchedulerHandler,
    },
    {
      method: 'patch',
      route: '/api/queues/:queueName/job-schedulers/:schedulerId',
      handler: updateJobSchedulerHandler,
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
      method: 'patch',
      route: '/api/queues/:queueName/:jobId/update-data',
      handler: updateJobDataHandler,
    },
    {
      method: 'patch',
      route: '/api/queues/:queueName/:jobId/delay',
      handler: changeJobDelayHandler,
    },
    {
      method: 'patch',
      route: '/api/queues/:queueName/:jobId/priority',
      handler: changeJobPriorityHandler,
    },
  ],
};
