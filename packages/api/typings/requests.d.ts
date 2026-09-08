import {
  JobStatus,
  MetricsHistoryGranularity,
  MetricsHistoryMetric,
  MetricsLatencyGranularity,
  MetricsLatencyMetric,
  QueueRateLimit,
} from './app';

export interface GetQueuesQuery {
  activeQueue?: string;
  status?: JobStatus | 'latest';
  page?: number;
  jobsPerPage?: number;
}

export interface GetJobSchedulersQuery {
  queueName?: string;
}

export interface GetJobFlowQuery {
  root?: 'node';
  depth?: number;
  maxChildren?: number;
}

export interface GetMetricsHistoryQuery {
  from: number;
  to: number;
  granularity?: MetricsHistoryGranularity;
  queue?: string;
  metric?: MetricsHistoryMetric;
}

export interface GetMetricsLatencyQuery {
  metric: MetricsLatencyMetric;
  from?: number;
  to?: number;
  granularity?: MetricsLatencyGranularity;
  queue?: string;
  percentiles?: string;
}

export interface AddJobBody {
  name: string;
  data?: Record<string, any>;
  options?: Record<string, any>;
}

export interface UpdateJobDataBody {
  jobData: Record<string, any>;
}

export interface ChangeJobDelayBody {
  runAt: number;
}

export interface ChangeJobPriorityBody {
  priority: number;
}

export interface SetGlobalConcurrencyBody {
  concurrency: number;
}

export type SetRateLimitBody = Partial<QueueRateLimit>;

export interface ObliterateQueueBody {
  force?: boolean;
}

export interface UpdateJobSchedulerBody {
  pattern?: string;
  every?: number | string;
  tz?: string;
  limit?: number;
  endDate?: number | string;
}

export interface RequestSchemas {
  GetQueuesQuery: GetQueuesQuery;
  GetJobSchedulersQuery: GetJobSchedulersQuery;
  GetJobFlowQuery: GetJobFlowQuery;
  GetMetricsHistoryQuery: GetMetricsHistoryQuery;
  GetMetricsLatencyQuery: GetMetricsLatencyQuery;
  AddJobBody: AddJobBody;
  UpdateJobDataBody: UpdateJobDataBody;
  ChangeJobDelayBody: ChangeJobDelayBody;
  ChangeJobPriorityBody: ChangeJobPriorityBody;
  SetGlobalConcurrencyBody: SetGlobalConcurrencyBody;
  SetRateLimitBody: SetRateLimitBody;
  ObliterateQueueBody: ObliterateQueueBody;
  UpdateJobSchedulerBody: UpdateJobSchedulerBody;
}
