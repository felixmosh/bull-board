import { AppJob, AppQueue, QueueDefaultJobOptions, QueueMetrics, Status } from './app';

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
