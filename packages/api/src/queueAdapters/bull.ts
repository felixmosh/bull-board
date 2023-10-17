import { Job, Queue } from 'bull';
import { JobCleanStatus, JobCounts, JobStatus, QueueAdapterOptions, Status } from '../../typings/app';
import { STATUSES } from '../constants/statuses';
import { BaseAdapter } from './base';

export class BullAdapter extends BaseAdapter {
  constructor(public queue: Queue, options: Partial<QueueAdapterOptions> = {}) {
    super({ ...options, allowCompletedRetries: false });
  }

  public getRedisInfo(): Promise<string> {
    return this.queue.client.info();
  }

  public getName(): string {
    return `${this.prefix}${this.queue.name}`;
  }

  public clean(jobStatus: JobCleanStatus, graceTimeMs: number): Promise<any> {
    return this.queue.clean(graceTimeMs, jobStatus as any);
  }

  public getJob(id: string): Promise<Job | undefined | null> {
    return this.queue.getJob(id).then((job) => {
      if (typeof job?.attemptsMade === 'number') {
        job.attemptsMade++;
      }
      return job;
    });
  }

  public getJobs(jobStatuses: JobStatus<'bull'>[], start?: number, end?: number): Promise<Job[]> {
    return this.queue.getJobs(jobStatuses, start, end).then((jobs) =>
      jobs.map((job) => {
        if (typeof job?.attemptsMade === 'number') {
          job.attemptsMade++; // increase to align it with bullMQ behavior
        }

        return job;
      })
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public getJobCounts(..._jobStatuses: JobStatus<'bull'>[]): Promise<JobCounts> {
    return this.queue.getJobCounts() as unknown as Promise<JobCounts>;
  }

  public getJobLogs(id: string): Promise<string[]> {
    return this.queue.getJobLogs(id).then(({ logs }) => logs);
  }

  public isPaused(): Promise<boolean> {
    return this.queue.isPaused();
  }

  public pause(): Promise<void> {
    return this.queue.pause();
  }

  public resume(): Promise<void> {
    return this.queue.resume();
  }

  public empty(): Promise<void> {
    return this.queue.empty();
  }

  public async promoteAll(): Promise<void> {
    const jobs = await this.getJobs([STATUSES.delayed]);
    await Promise.all(jobs.map((job) => job.promote()));
  }

  public getPossibleStatuses(): Status<'bull'>[] {
    return ['latest', 'active', 'waiting','completed', 'failed', 'delayed', 'paused']
  }

  public getPossibleJobStatuses(): JobStatus<'bull'>[] {
    return ['active', 'waiting','completed', 'failed', 'delayed', 'paused']
  }
}
