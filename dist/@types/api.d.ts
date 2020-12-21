import { ValidMetrics, AppQueue } from './app';
export interface GetQueues {
    stats: Partial<ValidMetrics>;
    queues: AppQueue[];
}
