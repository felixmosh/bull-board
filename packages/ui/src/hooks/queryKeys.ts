import type { Status } from '../../typings/app';

export interface QueuesQueryParams {
  activeQueue: string | undefined;
  status: Status | undefined;
  page: string;
  jobsPerPage: number;
}

export interface JobSearchQueryParams {
  queueName: string;
  field: string;
  value: string;
  status: Status | undefined;
}

export const queryKeys = {
  queues: {
    all: ['queues'] as const,
    list: (params: QueuesQueryParams) => ['queues', params] as const,
    search: (params: JobSearchQueryParams) => ['queues', 'search', params] as const,
  },
  queueWorkers: (queueName: string | null) => ['queueWorkers', queueName] as const,
  queueHasWorkers: (queueName: string) => ['queueHasWorkers', queueName] as const,
  job: (queueName: string, jobId: string) => ['job', queueName, jobId] as const,
  jobFlow: (queueName: string, jobId: string) => ['jobFlow', queueName, jobId] as const,
  jobFlowNode: (queueName: string, jobId: string) => ['jobFlowNode', queueName, jobId] as const,
  metrics: (queueName: string | null) => ['metrics', queueName] as const,
  searchFields: (queueName: string | null) => ['searchFields', queueName] as const,
  jobDataSchema: (queueName: string | null) => ['jobDataSchema', queueName] as const,
  defaultJobOptions: (queueName: string | null) => ['defaultJobOptions', queueName] as const,
  queueRateLimit: (queueName: string | null) => ['queueRateLimit', queueName] as const,
  historyMetrics: (params: {
    queue?: string;
    metric?: string;
    from: number;
    to: number;
    granularity: string;
  }) => ['historyMetrics', params] as const,
  latencyMetrics: (params: {
    queue?: string;
    metric: string;
    from: number;
    to: number;
    granularity: string;
    percentiles: number[];
  }) => ['latencyMetrics', params] as const,
  jobSchedulers: {
    all: ['jobSchedulers'] as const,
    list: (queueName: string | undefined) => ['jobSchedulers', queueName ?? null] as const,
    count: ['jobSchedulersCount'] as const,
  },
  historyUsage: ['historyUsage'] as const,
  redisStats: ['redisStats'] as const,
};
