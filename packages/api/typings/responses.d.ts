import {
  AppJob,
  AppJobScheduler,
  AppQueue,
  JobFlow,
  JobState,
  MetricsHistoryMetric,
  MetricsHistoryPoint,
  MetricsHistoryPurgeResult,
  MetricsHistoryUsage,
  MetricsLatencyPoint,
  QueueDefaultJobOptions,
  QueueMetrics,
  QueueRateLimit,
  QueueWorker,
  RedisStats,
  TranslatableMessage,
} from './app';

export interface GetQueuesResponse {
  queues: AppQueue[];
}

export interface GetJobResponse {
  job: AppJob;
  status: JobState;
}

export interface GetQueueMetricsResponse {
  completed: QueueMetrics | null;
  failed: QueueMetrics | null;
}

export type GetQueueDefaultJobOptionsResponse = QueueDefaultJobOptions;

export type GetQueueJobDataSchemaResponse = Record<string, any>;

/**
 * Returned with a 400 when the job being cleaned is the next run of a job scheduler. Removing that
 * run on its own would leave the scheduler registered but unable to fire again, so the caller has
 * to decide whether to remove the whole scheduler instead.
 */
export interface JobBelongsToJobSchedulerResponse {
  error: TranslatableMessage;
  message: TranslatableMessage;
  code: 'JOB_BELONGS_TO_JOB_SCHEDULER';
  jobSchedulerId: string;
}

export type CleanJobResponse = JobBelongsToJobSchedulerResponse | undefined;

/** `skipped` counts ids that were in the set with no job behind them, so a partial retry is visible. */
export interface RetryAllResponse {
  retried: number;
  skipped: number;
}

export interface GetJobSchedulersResponse {
  schedulers: AppJobScheduler[];
}

/** The one-off job an on-demand scheduler run produced. */
export interface RunJobSchedulerResponse {
  job: AppJob;
}

export interface GetQueueRateLimitResponse {
  supported: boolean;
  rateLimit: QueueRateLimit | null;
}

export interface GetQueueWorkersResponse {
  workers: QueueWorker[] | null;
}

/**
 * Keyed by the metrics that were asked for: `completed` and `failed` when the request names
 * no metric, and just the named one when it does.
 */
export type GetMetricsHistoryResponse = Partial<
  Record<MetricsHistoryMetric, MetricsHistoryPoint[]>
>;

export type GetMetricsHistoryUsageResponse = MetricsHistoryUsage;

export type PurgeMetricsHistoryResponse = MetricsHistoryPurgeResult;

export type GetMetricsLatencyResponse = MetricsLatencyPoint[];

export type GetJobLogsResponse = string[];

export type GetJobFlowResponse = JobFlow;

export type AddJobResponse = GetJobResponse;

export type GetRedisStatsResponse = RedisStats | Record<string, never>;

export type RemoveUnprocessedChildrenResponse = { removed: number };

export type EmptyResponse = Record<string, never>;

export interface ResponseSchemas {
  GetQueuesResponse: GetQueuesResponse;
  GetJobResponse: GetJobResponse;
  AddJobResponse: AddJobResponse;
  GetQueueMetricsResponse: GetQueueMetricsResponse;
  GetQueueDefaultJobOptionsResponse: GetQueueDefaultJobOptionsResponse;
  GetQueueJobDataSchemaResponse: GetQueueJobDataSchemaResponse;
  GetQueueRateLimitResponse: GetQueueRateLimitResponse;
  GetQueueWorkersResponse: GetQueueWorkersResponse;
  GetJobSchedulersResponse: GetJobSchedulersResponse;
  RunJobSchedulerResponse: RunJobSchedulerResponse;
  GetJobLogsResponse: GetJobLogsResponse;
  GetJobFlowResponse: GetJobFlowResponse;
  GetRedisStatsResponse: GetRedisStatsResponse;
  GetMetricsHistoryResponse: GetMetricsHistoryResponse;
  GetMetricsHistoryUsageResponse: GetMetricsHistoryUsageResponse;
  GetMetricsLatencyResponse: GetMetricsLatencyResponse;
  PurgeMetricsHistoryResponse: PurgeMetricsHistoryResponse;
  RetryAllResponse: RetryAllResponse;
  RemoveUnprocessedChildrenResponse: RemoveUnprocessedChildrenResponse;
  EmptyResponse: EmptyResponse;
}
