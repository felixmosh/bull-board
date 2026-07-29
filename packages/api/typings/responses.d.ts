import {
  AppJob,
  AppJobScheduler,
  AppQueue,
  MetricsHistoryPoint,
  MetricsHistoryPurgeResult,
  MetricsHistoryUsage,
  QueueDefaultJobOptions,
  QueueMetrics,
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

/**
 * Cheap enough to ask for on every page load: one `ZCARD` per queue. The UI uses it to decide
 * whether the schedulers view is worth linking to at all.
 */
export interface GetJobSchedulersCountResponse {
  total: number;
  byQueue: Record<string, number>;
}

export interface GetMetricsHistoryResponse {
  completed: MetricsHistoryPoint[];
  failed: MetricsHistoryPoint[];
}

export type GetMetricsHistoryUsageResponse = MetricsHistoryUsage;

export type PurgeMetricsHistoryResponse = MetricsHistoryPurgeResult;
