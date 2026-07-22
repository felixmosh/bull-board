import type { Status } from '../../typings/app';

export interface QueuesQueryParams {
  activeQueue: string | undefined;
  status: Status | undefined;
  page: string;
  jobsPerPage: number;
}

export const queryKeys = {
  queues: {
    all: ['queues'] as const,
    list: (params: QueuesQueryParams) => ['queues', params] as const,
  },
  job: (queueName: string, jobId: string) => ['job', queueName, jobId] as const,
  jobFlow: (queueName: string, jobId: string) => ['jobFlow', queueName, jobId] as const,
  metrics: (queueName: string | null) => ['metrics', queueName] as const,
  jobDataSchema: (queueName: string | null) => ['jobDataSchema', queueName] as const,
  defaultJobOptions: (queueName: string | null) => ['defaultJobOptions', queueName] as const,
  redisStats: ['redisStats'] as const,
};
