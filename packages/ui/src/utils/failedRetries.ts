import type { AppQueue } from '@bull-board/api/typings/app';

export function canRetryFailedJobs(queue: AppQueue): boolean {
  return !queue.readOnlyMode && queue.allowRetries && (queue.counts?.failed || 0) > 0;
}

export interface RetriableFailedJobs {
  queueNames: string[];
  jobCount: number;
}

export function retriableFailedJobs(queues: AppQueue[]): RetriableFailedJobs {
  const retriable = queues.filter(canRetryFailedJobs);

  return {
    queueNames: retriable.map((queue) => queue.name),
    jobCount: retriable.reduce((total, queue) => total + queue.counts.failed, 0),
  };
}
