import { Job, Queue } from 'bullmq'
import * as Redis from 'ioredis'
import {
  JobCleanStatus,
  JobCounts,
  JobStatus,
  QueueAdapter,
} from '../@types/app'

export class BullMQAdapter implements QueueAdapter {
  private readonly LIMIT = 1000

  public get client() {
    return (this.queue.client as unknown) as Promise<Redis.Redis>
  }

  constructor(private queue: Queue) {}

  public getName(): string {
    return this.queue.toKey('~')
  }

  public clean(jobStatus: JobCleanStatus, graceTimeMs: number): Promise<void> {
    return this.queue.clean(graceTimeMs, this.LIMIT, jobStatus)
  }

  public getJob(id: string): Promise<Job | undefined> {
    return this.queue.getJob(id)
  }

  public getLogs(id: string): Promise<string[]> {
    return this.queue.getJobLogs(id).then(({logs}) => logs);
  }

  public getJobs(
    jobStatuses: JobStatus[],
    start?: number,
    end?: number,
  ): Promise<Job[]> {
    return this.queue.getJobs(jobStatuses, start, end)
  }

  public getJobCounts(...jobStatuses: JobStatus[]): Promise<JobCounts> {
    return (this.queue.getJobCounts(
      ...jobStatuses,
    ) as unknown) as Promise<JobCounts>
  }
}
