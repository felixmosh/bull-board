import {
  AppJob,
  AppJobScheduler,
  AppQueue,
  MetricsHistoryMetric,
  MetricsHistoryPoint,
  MetricsHistoryPurgeResult,
  MetricsHistoryUsage,
  QueueDefaultJobOptions,
  QueueMetrics,
  QueueWorker,
  Status,
  TranslatableMessage,
} from './app';

export interface GetQueuesResponse {
  queues: AppQueue[];
}

export interface GetJobResponse {
  job: AppJob;
  status: Status;
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

export interface GetJobSchedulersResponse {
  schedulers: AppJobScheduler[];
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
