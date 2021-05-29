import { AppQueue, ValidMetrics } from './app';

export interface GetQueuesResponse {
  stats: Partial<ValidMetrics>;
  queues: AppQueue[];
}
