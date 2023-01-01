import {
  AppJob,
  AppQueue,
  JobCleanStatus,
  JobRetryStatus,
  Status,
} from '@bull-board/api/typings/app';

export { Status } from '@bull-board/api/typings/app';

export type SelectedStatuses = Record<AppQueue['name'], Status>;

export interface QueueActions {
  promoteJob: (queueName: string) => (job: AppJob) => () => Promise<void>;
  retryJob: (queueName: string, status: JobRetryStatus) => (job: AppJob) => () => Promise<void>;
  cleanJob: (queueName: string) => (job: AppJob) => () => Promise<void>;
  getJobLogs: (queueName: string) => (job: AppJob) => () => Promise<string[]>;
  retryAll: (queueName: string, status: JobRetryStatus) => () => Promise<void>;
  cleanAll: (queueName: string, status: JobCleanStatus) => () => Promise<void>;
  pauseQueue: (queueName: string) => () => Promise<void>;
  resumeQueue: (queueName: string) => () => Promise<void>;
  emptyQueue: (queueName: string) => () => Promise<void>;
}
