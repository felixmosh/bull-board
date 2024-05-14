import {
  AppJob,
  AppQueue,
  JobCleanStatus,
  JobRetryStatus,
  Status,
} from '@wirdo-bullboard/api/typings/app';

export { Status } from '@wirdo-bullboard/api/typings/app';

export type SelectedStatuses = Record<AppQueue['name'], Status>;

export interface QueueActions {
  retryAll: (queueName: string, status: JobRetryStatus) => () => Promise<void>;
  promoteAll: (queueName: string) => () => Promise<void>;
  cleanAll: (queueName: string, status: JobCleanStatus) => () => Promise<void>;
  pauseQueue: (queueName: string) => () => Promise<void>;
  resumeQueue: (queueName: string) => () => Promise<void>;
  emptyQueue: (queueName: string) => () => Promise<void>;
  updateQueues: () => Promise<void>;
  pollQueues: () => void;
}

export interface JobActions {
  promoteJob: (queueName: string) => (job: AppJob) => () => Promise<void>;
  retryJob: (queueName: string, status: JobRetryStatus) => (job: AppJob) => () => Promise<void>;
  cleanJob: (queueName: string) => (job: AppJob) => () => Promise<void>;
  getJobLogs: (queueName: string) => (job: AppJob) => () => Promise<string[]>;
  getJob: () => Promise<any>;
  pollJob: () => void;
}
