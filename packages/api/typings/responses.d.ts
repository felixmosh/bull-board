import {
  AppJob,
  AppQueue,
  MetricsHistoryPoint,
  MetricsHistoryPurgeResult,
  MetricsHistoryUsage,
  QueueDefaultJobOptions,
  QueueMetrics,
  Status,
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
  error: string;
  message: string;
  code: 'JOB_BELONGS_TO_JOB_SCHEDULER';
  jobSchedulerId: string;
}

export type CleanJobResponse = JobBelongsToJobSchedulerResponse | undefined;

export interface GetMetricsHistoryResponse {
  completed: MetricsHistoryPoint[];
  failed: MetricsHistoryPoint[];
}

export type GetMetricsHistoryUsageResponse = MetricsHistoryUsage;

export type PurgeMetricsHistoryResponse = MetricsHistoryPurgeResult;
