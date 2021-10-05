import { AppJob, AppQueue, Status } from '@bull-board/api/typings/app';

export { Status } from '@bull-board/api/typings/app';

export type SelectedStatuses = Record<AppQueue['name'], Status>;

export interface QueueActions {
  promoteJob: (queueName: string) => (job: AppJob) => () => Promise<void>;
  retryJob: (queueName: string) => (job: AppJob) => () => Promise<void>;
  cleanJob: (queueName: string) => (job: AppJob) => () => Promise<void>;
  getJobLogs: (queueName: string) => (job: AppJob) => () => Promise<string[]>;
  retryAll: (queueName: string) => () => Promise<void>;
  cleanAllDelayed: (queueName: string) => () => Promise<void>;
  cleanAllFailed: (queueName: string) => () => Promise<void>;
  cleanAllCompleted: (queueName: string) => () => Promise<void>;
  pauseQueue: (queueName: string) => () => Promise<void>;
  resumeQueue: (queueName: string) => () => Promise<void>;
}
