import {
  AdapterOptions,
  JobCleanStatus,
  JobCounts,
  JobStatus,
  QueueAdapter,
} from '../@types/app'
import { Job, Queue } from 'bull'

export class BullAdapter implements QueueAdapter {
  public get client() {
    return Promise.resolve(this.queue.client)
  }

  constructor(public queue: Queue, public options: AdapterOptions) {}

  public getName(): string {
    return this.queue.name
  }

  public clean(jobStatus: JobCleanStatus, graceTimeMs: number): Promise<any> {
    return this.queue.clean(graceTimeMs, jobStatus as any)
  }

  public getJob(id: string): Promise<Job | undefined | null> {
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
    return this.queue.getJobs(jobStatuses as any, start, end)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public getJobCounts(..._jobStatuses: JobStatus[]): Promise<JobCounts> {
    return (this.queue.getJobCounts() as unknown) as Promise<JobCounts>
  }
}
