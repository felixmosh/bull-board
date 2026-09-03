import { AppControllerRoute, AppRouteDefs, MetricsHistoryProvider } from '../typings/app';
import { ResponseSchemas } from '../typings/responses';
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
import { createMetricsHistoryHandler } from './handlers/metricsHistory';
import {
  createMetricsHistoryPurgeHandler,
  createMetricsHistoryUsageHandler,
} from './handlers/metricsHistoryStorage';
import { createMetricsLatencyHandler } from './handlers/metricsLatency';
import { obliterateQueueHandler } from './handlers/obliterateQueue';
import { pauseAllHandler } from './handlers/pauseAll';
import { pauseQueueHandler } from './handlers/pauseQueue';
import { promoteAllHandler } from './handlers/promoteAll';
import { promoteJobHandler } from './handlers/promotJob';
import { queuesHandler } from './handlers/queues';
import { queueWorkersHandler } from './handlers/queueWorkers';
import {
  getRateLimitHandler,
  releaseRateLimitHandler,
  setRateLimitHandler,
} from './handlers/rateLimit';
import { redisStatsHandler } from './handlers/redisStats';
import { removeJobSchedulerHandler } from './handlers/removeJobScheduler';
import { removeUnprocessedChildrenHandler } from './handlers/removeUnprocessedChildren';
import { resumeAllHandler } from './handlers/resumeAll';
import { resumeQueueHandler } from './handlers/resumeQueue';
import { retryAllHandler } from './handlers/retryAll';
import { retryJobHandler } from './handlers/retryJob';
import { runJobSchedulerHandler } from './handlers/runJobScheduler';
import { setGlobalConcurrencyHandler } from './handlers/setGlobalConcurrency';
import { updateJobDataHandler } from './handlers/updateJobData';
import { updateJobSchedulerHandler } from './handlers/updateJobScheduler';

function defineRoute<TResponse extends keyof ResponseSchemas>(
  definition: AppControllerRoute<TResponse>
): AppControllerRoute<TResponse> {
  return definition;
}

const HISTORY_AVAILABILITY = 'A `historyProvider` is configured on the board.';

export function buildHistoryRoutes(
  provider: MetricsHistoryProvider,
  capabilities: { hasUsage: boolean; canPurge: boolean; hasLatency: boolean }
): AppControllerRoute[] {
  const routes: AppControllerRoute[] = [
    defineRoute({
      method: 'get',
      route: '/api/metrics/history',
      spec: {
        summary: 'Read recorded job counter history over a time range.',
        response: 'GetMetricsHistoryResponse',
        query: 'GetMetricsHistoryQuery',
        availableWhen: HISTORY_AVAILABILITY,
      },
      handler: createMetricsHistoryHandler(provider),
    }),
  ];

  if (capabilities.hasUsage) {
    routes.push(
      defineRoute({
        method: 'get',
        route: '/api/metrics/history/usage',
        spec: {
          summary: 'Report how much storage the recorded history occupies.',
          response: 'GetMetricsHistoryUsageResponse',
          availableWhen: `${HISTORY_AVAILABILITY} The provider implements \`getUsage\`.`,
        },
        handler: createMetricsHistoryUsageHandler(provider),
      })
    );
  }

  if (capabilities.canPurge) {
    routes.push(
      defineRoute({
        method: 'post',
        route: '/api/metrics/history/purge',
        spec: {
          summary: 'Delete recorded history.',
          response: 'PurgeMetricsHistoryResponse',
          availableWhen: `${HISTORY_AVAILABILITY} The provider implements \`purge\` and the board is not read-only.`,
        },
        handler: createMetricsHistoryPurgeHandler(provider),
      })
    );
  }

  if (capabilities.hasLatency) {
    routes.push(
      defineRoute({
        method: 'get',
        route: '/api/metrics/latency',
        spec: {
          summary: 'Read recorded runtime or wait-time latency percentiles over a time range.',
          response: 'GetMetricsLatencyResponse',
          query: 'GetMetricsLatencyQuery',
          availableWhen: `${HISTORY_AVAILABILITY} The provider implements \`getLatency\`.`,
        },
        handler: createMetricsLatencyHandler(provider),
      })
    );
  }

  return routes;
}

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
    defineRoute({
      method: 'get',
      route: '/api/redis/stats',
      spec: {
        summary: "Read the datastore statistics of the board's first queue.",
        response: 'GetRedisStatsResponse',
      },
      handler: redisStatsHandler,
    }),
    defineRoute({
      method: 'get',
      route: '/api/queues',
      spec: {
        summary: 'List every visible queue with its job counts, and the jobs of the active queue.',
        response: 'GetQueuesResponse',
        query: 'GetQueuesQuery',
      },
      handler: queuesHandler,
    }),
    defineRoute({
      method: 'get',
      route: '/api/job-schedulers',
      spec: {
        summary: 'List job schedulers across every visible queue, or one named queue.',
        response: 'GetJobSchedulersResponse',
        query: 'GetJobSchedulersQuery',
      },
      handler: jobSchedulersHandler,
    }),
    defineRoute({
      method: 'get',
      route: '/api/queues/:queueName/metrics',
      spec: {
        summary: 'Read the BullMQ completed and failed counter metrics of one queue.',
        response: 'GetQueueMetricsResponse',
      },
      handler: metricsHandler,
    }),
    defineRoute({
      method: 'get',
      route: '/api/queues/:queueName/default-job-options',
      spec: {
        summary: 'Read the default job options configured on one queue.',
        response: 'GetQueueDefaultJobOptionsResponse',
      },
      handler: defaultJobOptionsHandler,
    }),
    defineRoute({
      method: 'get',
      route: '/api/queues/:queueName/workers',
      spec: {
        summary: 'List the workers currently consuming one queue.',
        response: 'GetQueueWorkersResponse',
      },
      handler: queueWorkersHandler,
    }),
    defineRoute({
      method: 'get',
      route: '/api/queues/:queueName/rate-limit',
      spec: {
        summary: 'Read the configured rate limit of one queue.',
        response: 'GetQueueRateLimitResponse',
      },
      handler: getRateLimitHandler,
    }),
    defineRoute({
      method: 'get',
      route: '/api/queues/:queueName/job-data-schema',
      spec: {
        summary: 'Read the JSON Schema describing the job data of one queue.',
        response: 'GetQueueJobDataSchemaResponse',
      },
      handler: jobDataSchemaHandler,
    }),
    defineRoute({
      method: 'put',
      route: '/api/queues/pause',
      spec: { summary: 'Pause every writable queue on the board.', response: 'EmptyResponse' },
      handler: pauseAllHandler,
    }),
    defineRoute({
      method: 'put',
      route: '/api/queues/resume',
      spec: { summary: 'Resume every writable queue on the board.', response: 'EmptyResponse' },
      handler: resumeAllHandler,
    }),
    defineRoute({
      method: 'get',
      route: '/api/queues/:queueName/:jobId/logs',
      spec: { summary: 'Read the logs of one job.', response: 'GetJobLogsResponse' },
      handler: jobLogsHandler,
    }),
    defineRoute({
      method: 'get',
      route: '/api/queues/:queueName/:jobId/flow',
      spec: {
        summary: 'Read the flow tree one job belongs to.',
        response: 'GetJobFlowResponse',
        query: 'GetJobFlowQuery',
      },
      handler: jobFlowHandler,
    }),
    defineRoute({
      method: 'get',
      route: '/api/queues/:queueName/:jobId',
      spec: { summary: 'Read one job and its current status.', response: 'GetJobResponse' },
      handler: jobHandler,
    }),
    defineRoute({
      method: 'post',
      route: '/api/queues/:queueName/add',
      spec: {
        summary: 'Add a job to one queue.',
        response: 'AddJobResponse',
        body: 'AddJobBody',
      },
      handler: addJobHandler,
    }),
    defineRoute({
      method: 'put',
      route: '/api/queues/:queueName/retry/:queueStatus',
      spec: {
        summary: 'Retry every job of one queue in the given status.',
        response: 'RetryAllResponse',
      },
      handler: retryAllHandler,
    }),
    defineRoute({
      method: 'put',
      route: '/api/queues/:queueName/promote',
      spec: {
        summary: 'Promote every delayed job of one queue.',
        response: 'EmptyResponse',
      },
      handler: promoteAllHandler,
    }),
    defineRoute({
      method: 'put',
      route: '/api/queues/:queueName/clean/:queueStatus',
      spec: {
        summary: 'Remove every job of one queue in the given status.',
        response: 'EmptyResponse',
      },
      handler: cleanAllHandler,
    }),
    defineRoute({
      method: 'put',
      route: '/api/queues/:queueName/pause',
      spec: { summary: 'Pause one queue.', response: 'EmptyResponse' },
      handler: pauseQueueHandler,
    }),
    defineRoute({
      method: 'put',
      route: '/api/queues/:queueName/resume',
      spec: { summary: 'Resume one queue.', response: 'EmptyResponse' },
      handler: resumeQueueHandler,
    }),
    defineRoute({
      method: 'put',
      route: '/api/queues/:queueName/concurrency',
      spec: {
        summary: 'Set the global concurrency limit of one queue.',
        response: 'EmptyResponse',
        body: 'SetGlobalConcurrencyBody',
      },
      handler: setGlobalConcurrencyHandler,
    }),
    defineRoute({
      method: 'put',
      route: '/api/queues/:queueName/rate-limit',
      spec: {
        summary: 'Set the rate limit of one queue.',
        response: 'EmptyResponse',
        body: 'SetRateLimitBody',
      },
      handler: setRateLimitHandler,
    }),
    defineRoute({
      method: 'put',
      route: '/api/queues/:queueName/rate-limit/release',
      spec: { summary: 'Release an active rate limit on one queue.', response: 'EmptyResponse' },
      handler: releaseRateLimitHandler,
    }),
    defineRoute({
      method: 'put',
      route: '/api/queues/:queueName/empty',
      spec: { summary: 'Remove every job from one queue.', response: 'EmptyResponse' },
      handler: emptyQueueHandler,
    }),
    defineRoute({
      method: 'put',
      route: '/api/queues/:queueName/obliterate',
      spec: {
        summary: 'Obliterate one queue, removing the queue itself along with all of its jobs.',
        response: 'EmptyResponse',
        body: 'ObliterateQueueBody',
      },
      handler: obliterateQueueHandler,
    }),
    defineRoute({
      method: 'put',
      route: '/api/queues/:queueName/job-schedulers/:schedulerId/remove',
      spec: { summary: 'Remove one job scheduler.', response: 'EmptyResponse' },
      handler: removeJobSchedulerHandler,
    }),
    defineRoute({
      method: 'patch',
      route: '/api/queues/:queueName/job-schedulers/:schedulerId',
      spec: {
        summary: 'Update the schedule of one job scheduler.',
        response: 'EmptyResponse',
        body: 'UpdateJobSchedulerBody',
      },
      handler: updateJobSchedulerHandler,
    }),
    defineRoute({
      method: 'put',
      route: '/api/queues/:queueName/job-schedulers/:schedulerId/run',
      handler: runJobSchedulerHandler,
    },
    {
      method: 'put',
      route: '/api/queues/:queueName/:jobId/retry',
      spec: { summary: 'Retry one job.', response: 'EmptyResponse' },
      handler: retryJobHandler,
    }),
    defineRoute({
      method: 'put',
      route: '/api/queues/:queueName/:jobId/clean',
      spec: { summary: 'Remove one job.', response: 'EmptyResponse', successStatus: 204 },
      handler: cleanJobHandler,
    }),
    defineRoute({
      method: 'put',
      route: '/api/queues/:queueName/:jobId/promote',
      spec: { summary: 'Promote one delayed job.', response: 'EmptyResponse' },
      handler: promoteJobHandler,
    }),
    defineRoute({
      method: 'patch',
      route: '/api/queues/:queueName/:jobId/update-data',
      spec: {
        summary: 'Replace the data of one job.',
        response: 'EmptyResponse',
        body: 'UpdateJobDataBody',
      },
      handler: updateJobDataHandler,
    }),
    defineRoute({
      method: 'patch',
      route: '/api/queues/:queueName/:jobId/delay',
      spec: {
        summary: 'Reschedule one delayed job.',
        response: 'EmptyResponse',
        body: 'ChangeJobDelayBody',
      },
      handler: changeJobDelayHandler,
    }),
    defineRoute({
      method: 'patch',
      route: '/api/queues/:queueName/:jobId/priority',
      spec: {
        summary: 'Change the priority of one job.',
        response: 'EmptyResponse',
        body: 'ChangeJobPriorityBody',
      },
      handler: changeJobPriorityHandler,
    }),
    defineRoute({
      method: 'put',
      route: '/api/queues/:queueName/:jobId/remove-unprocessed-children',
      spec: {
        summary: 'Remove the unprocessed children of one job.',
        response: 'RemoveUnprocessedChildrenResponse',
      },
      handler: removeUnprocessedChildrenHandler,
    }),
  ],
};
