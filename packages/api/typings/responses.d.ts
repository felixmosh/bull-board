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

export interface GetMetricsHistoryResponse {
  points: MetricsHistoryPoint[];
}

export type GetMetricsHistoryUsageResponse = MetricsHistoryUsage;

export type PurgeMetricsHistoryResponse = MetricsHistoryPurgeResult;
