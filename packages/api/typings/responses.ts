import { AppJob, AppQueue, Status } from './app';

export interface GetQueuesResponse {
  queues: AppQueue[];
}

export interface GetJobResponse {
  job: AppJob;
  status: Status;
}
