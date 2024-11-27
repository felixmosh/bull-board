import { Job, Queue } from 'bullmq';
import {
  JobCleanStatus,
  JobCounts,
  JobStatus,
  JobTemplate,
  QueueAdapterOptions,
  QueueJobOptions,
  RepeatableJob,
  RepeatOptions,
  Status,
} from '../../typings/app';
import { STATUSES } from '../constants/statuses';
import { BaseAdapter } from './base';

export class BullMQAdapter extends BaseAdapter {
  constructor(private queue: Queue, options: Partial<QueueAdapterOptions> = {}) {
    const libName = 'bullmq';
    super(libName, options);
    if (
      !(queue instanceof Queue || `${(queue as Queue).metaValues?.version}`?.startsWith(libName))
    ) {
      throw new Error(`You've used the BullMQ adapter with a non-BullMQ queue.`);
    }
  }

  public async getRedisInfo(): Promise<string> {
    const client = await this.queue.client;
    return client.info();
  }

  public getName(): string {
    return `${this.prefix}${this.queue.name}`;
  }

  public async clean(jobStatus: JobCleanStatus, graceTimeMs: number): Promise<void> {
    await this.queue.clean(graceTimeMs, Number.MAX_SAFE_INTEGER, jobStatus);
  }

  public addJob(name: string, data: any, options: QueueJobOptions) {
    return this.queue.add(name, data, options);
  }

  public upsertJobScheduler(
    name: string,
    repeatOptions: RepeatOptions,
    jobTemplate: JobTemplate
  ): Promise<Job> {
    return this.queue.upsertJobScheduler(name, repeatOptions, jobTemplate);
  }

  public getJob(id: string): Promise<Job | undefined> {
    return this.queue.getJob(id);
  }

  public getJobs(jobStatuses: JobStatus[], start?: number, end?: number): Promise<Job[]> {
    return this.queue.getJobs(jobStatuses, start, end);
  }

  public getJobScheduler(id: string): Promise<RepeatableJob | undefined> {
    return this.getJobSchedulers().then((schedulers) => schedulers.find((job) => job.key === id));
  }

  public getJobSchedulers(): Promise<RepeatableJob[]> {
    return this.queue.getJobSchedulers();
  }

  public getJobSchedulerCount(): Promise<number> {
    return this.getJobSchedulers().then((schedulers) => schedulers.length);
  }

  public getJobCounts(): Promise<JobCounts> {
    return this.queue.getJobCounts().then(
      (counts) =>
        this.getJobSchedulerCount().then((schedulerCount) => ({
          ...counts,
          [STATUSES.scheduler]: schedulerCount,
        })) as unknown as JobCounts
    );
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
    return this.queue.drain();
  }

  public async promoteAll(): Promise<void> {
    // since bullmq 4.6.0
    if (typeof this.queue.promoteJobs === 'function') {
      await this.queue.promoteJobs();
    } else {
      const jobs = await this.getJobs([STATUSES.delayed]);
      await Promise.all(jobs.map((job) => job.promote()));
    }
  }

  public getStatuses(): Status[] {
    return [
      STATUSES.latest,
      STATUSES.active,
      STATUSES.waiting,
      STATUSES.waitingChildren,
      STATUSES.prioritized,
      STATUSES.completed,
      STATUSES.failed,
      STATUSES.delayed,
      STATUSES.paused,
      STATUSES.scheduler,
    ];
  }

  public getJobStatuses(): JobStatus[] {
    return [
      STATUSES.active,
      STATUSES.waiting,
      STATUSES.waitingChildren,
      STATUSES.prioritized,
      STATUSES.completed,
      STATUSES.failed,
      STATUSES.delayed,
      STATUSES.paused,
    ];
  }
}
