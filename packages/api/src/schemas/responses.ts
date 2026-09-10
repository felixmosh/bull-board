import * as v from 'valibot';
import {
  appJobSchedulerSchema,
  appJobSchema,
  appQueueSchema,
  jobFlowSchema,
  jobStateSchema,
  metricsHistoryPointSchema,
  metricsHistoryPurgeResultSchema,
  metricsHistoryUsageSchema,
  metricsLatencyPointSchema,
  queueDefaultJobOptionsSchema,
  queueMetricsSchema,
  queueRateLimitSchema,
  queueWorkerSchema,
  redisStatsSchema,
  translatableMessageSchema,
} from './domain';

export const getQueuesResponseSchema = v.object({
  queues: v.array(appQueueSchema),
});

export const getJobResponseSchema = v.object({
  job: appJobSchema,
  status: jobStateSchema,
});

export const addJobResponseSchema = getJobResponseSchema;

export const getQueueMetricsResponseSchema = v.object({
  completed: v.nullable(queueMetricsSchema),
  failed: v.nullable(queueMetricsSchema),
});

export const getQueueDefaultJobOptionsResponseSchema = queueDefaultJobOptionsSchema;

export const getQueueJobDataSchemaResponseSchema = v.record(v.string(), v.any());

export const jobBelongsToJobSchedulerResponseSchema = v.pipe(
  v.object({
    error: translatableMessageSchema,
    message: translatableMessageSchema,
    code: v.literal('JOB_BELONGS_TO_JOB_SCHEDULER'),
    jobSchedulerId: v.string(),
  }),
  v.description(
    'Returned with a 400 when the job being cleaned is the next run of a job scheduler. Removing that run on its own would leave the scheduler registered but unable to fire again, so the caller has to decide whether to remove the whole scheduler instead.'
  )
);

export const cleanJobResponseSchema = v.optional(jobBelongsToJobSchedulerResponseSchema);

export const retryAllResponseSchema = v.object({
  retried: v.number(),
  skipped: v.pipe(
    v.number(),
    v.description(
      'Ids that were in the set with no job behind them, so a partial retry is visible.'
    )
  ),
});

export const getJobSchedulersResponseSchema = v.object({
  schedulers: v.array(appJobSchedulerSchema),
});

export const runJobSchedulerResponseSchema = v.pipe(
  v.object({ job: appJobSchema }),
  v.description('The one-off job an on-demand scheduler run produced.')
);

export const getQueueRateLimitResponseSchema = v.object({
  supported: v.boolean(),
  rateLimit: v.nullable(queueRateLimitSchema),
});

export const getQueueWorkersResponseSchema = v.object({
  workers: v.nullable(v.array(queueWorkerSchema)),
});

export const getMetricsHistoryResponseSchema = v.pipe(
  v.object({
    completed: v.optional(v.array(metricsHistoryPointSchema)),
    failed: v.optional(v.array(metricsHistoryPointSchema)),
    queueage: v.optional(v.array(metricsHistoryPointSchema)),
  }),
  v.description(
    'Keyed by the metrics that were asked for: `completed` and `failed` when the request names no metric, and just the named one when it does.'
  )
);

export const getMetricsHistoryUsageResponseSchema = metricsHistoryUsageSchema;

export const purgeMetricsHistoryResponseSchema = metricsHistoryPurgeResultSchema;

export const getMetricsLatencyResponseSchema = v.array(metricsLatencyPointSchema);

export const getJobLogsResponseSchema = v.array(v.string());

export const getJobFlowResponseSchema = jobFlowSchema;

export const getRedisStatsResponseSchema = v.union([redisStatsSchema, v.object({})]);

export const removeUnprocessedChildrenResponseSchema = v.object({ removed: v.number() });

export const emptyResponseSchema = v.object({});

export const responseSchemas = {
  GetQueuesResponse: getQueuesResponseSchema,
  GetJobResponse: getJobResponseSchema,
  AddJobResponse: addJobResponseSchema,
  GetQueueMetricsResponse: getQueueMetricsResponseSchema,
  GetQueueDefaultJobOptionsResponse: getQueueDefaultJobOptionsResponseSchema,
  GetQueueJobDataSchemaResponse: getQueueJobDataSchemaResponseSchema,
  GetQueueRateLimitResponse: getQueueRateLimitResponseSchema,
  GetQueueWorkersResponse: getQueueWorkersResponseSchema,
  GetJobSchedulersResponse: getJobSchedulersResponseSchema,
  RunJobSchedulerResponse: runJobSchedulerResponseSchema,
  GetJobLogsResponse: getJobLogsResponseSchema,
  GetJobFlowResponse: getJobFlowResponseSchema,
  GetRedisStatsResponse: getRedisStatsResponseSchema,
  GetMetricsHistoryResponse: getMetricsHistoryResponseSchema,
  GetMetricsHistoryUsageResponse: getMetricsHistoryUsageResponseSchema,
  GetMetricsLatencyResponse: getMetricsLatencyResponseSchema,
  PurgeMetricsHistoryResponse: purgeMetricsHistoryResponseSchema,
  RetryAllResponse: retryAllResponseSchema,
  RemoveUnprocessedChildrenResponse: removeUnprocessedChildrenResponseSchema,
  EmptyResponse: emptyResponseSchema,
};

export type ResponseSchemaName = keyof typeof responseSchemas;

type Schemas = typeof responseSchemas;

export type ResponseSchemas = { [K in keyof Schemas]: v.InferOutput<Schemas[K]> };

export type GetQueuesResponse = ResponseSchemas['GetQueuesResponse'];
export type GetJobResponse = ResponseSchemas['GetJobResponse'];
export type AddJobResponse = ResponseSchemas['AddJobResponse'];
export type GetQueueMetricsResponse = ResponseSchemas['GetQueueMetricsResponse'];
export type GetQueueDefaultJobOptionsResponse =
  ResponseSchemas['GetQueueDefaultJobOptionsResponse'];
export type GetQueueJobDataSchemaResponse = ResponseSchemas['GetQueueJobDataSchemaResponse'];
export type GetQueueRateLimitResponse = ResponseSchemas['GetQueueRateLimitResponse'];
export type GetQueueWorkersResponse = ResponseSchemas['GetQueueWorkersResponse'];
export type GetJobSchedulersResponse = ResponseSchemas['GetJobSchedulersResponse'];
export type RunJobSchedulerResponse = ResponseSchemas['RunJobSchedulerResponse'];
export type GetJobLogsResponse = ResponseSchemas['GetJobLogsResponse'];
export type GetJobFlowResponse = ResponseSchemas['GetJobFlowResponse'];
export type GetRedisStatsResponse = ResponseSchemas['GetRedisStatsResponse'];
export type GetMetricsHistoryResponse = ResponseSchemas['GetMetricsHistoryResponse'];
export type GetMetricsHistoryUsageResponse = ResponseSchemas['GetMetricsHistoryUsageResponse'];
export type GetMetricsLatencyResponse = ResponseSchemas['GetMetricsLatencyResponse'];
export type PurgeMetricsHistoryResponse = ResponseSchemas['PurgeMetricsHistoryResponse'];
export type RetryAllResponse = ResponseSchemas['RetryAllResponse'];
export type RemoveUnprocessedChildrenResponse =
  ResponseSchemas['RemoveUnprocessedChildrenResponse'];
export type EmptyResponse = ResponseSchemas['EmptyResponse'];

export type JobBelongsToJobSchedulerResponse = v.InferOutput<
  typeof jobBelongsToJobSchedulerResponseSchema
>;
export type CleanJobResponse = v.InferOutput<typeof cleanJobResponseSchema>;
