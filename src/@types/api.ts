import { AppQueue, ValidMetrics } from './app';

export interface GetQueues {
  stats: Partial<ValidMetrics>;
  queues: AppQueue[];
}
