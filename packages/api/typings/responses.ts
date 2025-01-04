import { AppJob, AppQueue, JobTreeNode, Status } from './app';

export interface GetQueuesResponse {
  queues: AppQueue[];
}

export interface GetJobResponse {
  job: AppJob;
  status: Status;
  jobTree: JobTreeNode[];
}
