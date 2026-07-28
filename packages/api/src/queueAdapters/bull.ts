import BullQueue, { Job, Queue } from 'bull';
import {
  AppJobScheduler,
  JobCleanStatus,
  JobCounts,
  JobSchedulerRepeatOptions,
  JobSchedulerUpdateResult,
  JobStatus,
  MetricsType,
  QueueAdapterOptions,
  QueueDefaultJobOptions,
  QueueJobOptions,
  QueueMetrics,
  Status,
} from '../../typings/app';
import { STATUSES } from '../constants/statuses';
import { BaseAdapter } from './base';

export class BullAdapter extends BaseAdapter {
  constructor(
    public queue: Queue,
    options: Partial<QueueAdapterOptions> = {}
  ) {
    super('bull', { ...options, allowCompletedRetries: false });

    if (!(queue instanceof BullQueue)) {
      throw new Error(`You've used the Bull adapter with a non-Bull queue.`);
    }
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

  public addJob(name: string, data: any, options: QueueJobOptions) {
    return this.queue.add(name, data, options);
  }

  public async getJob(id: string): Promise<Job | undefined | null> {
    const job = await this.queue.getJob(id);
    return job && this.alignJobData(job);
  }

  public async getJobs(
    jobStatuses: JobStatus<'bull'>[],
    start?: number,
    end?: number
  ): Promise<Job[]> {
    const jobs = await this.queue.getJobs(jobStatuses, start, end);
    return jobs.map(this.alignJobData);
  }

  public getJobCounts(): Promise<JobCounts> {
    return this.queue.getJobCounts() as unknown as Promise<JobCounts>;
  }

  public getJobLogs(id: string): Promise<string[]> {
    return this.queue.getJobLogs(id).then(({ logs }) => logs);
  }

  public async getMetrics(type: MetricsType, start?: number, end?: number): Promise<QueueMetrics> {
    const metrics = await this.queue.getMetrics(type, start, end);
    return { ...metrics, data: metrics.data.map((point) => +point || 0) };
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

  public obliterate(): Promise<void> {
    return this.queue.obliterate({ force: false });
  }

  public async promoteAll(): Promise<void> {
    const jobs = await this.getJobs([STATUSES.delayed]);
    await Promise.all(jobs.map((job) => job.promote()));
  }

  public async removeJobScheduler(id: string): Promise<boolean> {
    const repeatable = await this.queue
      .getRepeatableJobs()
      .then((jobs) => jobs.find((job) => job.key === id));

    if (!repeatable) {
      return false;
    }

    await this.queue.removeRepeatableByKey(id);

    return true;
  }

  public async getJobSchedulers(): Promise<Omit<AppJobScheduler, 'queueName'>[]> {
    const repeatables = await this.queue.getRepeatableJobs();

    // Bull keeps no iteration count, no template and nothing about the previous run, so those
    // stay absent rather than being guessed at.
    return repeatables.map((repeatable) => ({
      id: repeatable.key,
      name: repeatable.name,
      pattern: repeatable.cron || undefined,
      every: repeatable.every ? Number(repeatable.every) : undefined,
      tz: repeatable.tz,
      endDate: repeatable.endDate ?? undefined,
      next: repeatable.next,
    }));
  }

  public getJobSchedulersCount(): Promise<number> {
    return this.queue.getRepeatableCount();
  }

  public async updateJobScheduler(
    _id: string,
    _repeat: JobSchedulerRepeatOptions
  ): Promise<JobSchedulerUpdateResult> {
    // Bull has no upsert for repeatable jobs: rewriting a schedule means removing the old key and
    // adding a job with new repeat options, which would need the template Bull does not keep.
    throw new Error('Bull does not support updating a repeatable job');
  }

  public getStatuses(): Status<'bull'>[] {
    return [
      STATUSES.latest,
      STATUSES.active,
      STATUSES.waiting,
      STATUSES.completed,
      STATUSES.failed,
      STATUSES.delayed,
      STATUSES.paused,
    ];
  }

  public getJobStatuses(): JobStatus<'bull'>[] {
    return [
      STATUSES.active,
      STATUSES.waiting,
      STATUSES.completed,
      STATUSES.failed,
      STATUSES.delayed,
      STATUSES.paused,
    ];
  }

  public async getGlobalConcurrency(): Promise<number | null> {
    return null;
  }

  public async setGlobalConcurrency(_concurrency: number): Promise<void> {
    // Bull does not support global concurrency
  }

  public getQueueDefaultJobOptions(): QueueDefaultJobOptions {
    return (this.queue as { defaultJobOptions?: QueueDefaultJobOptions }).defaultJobOptions ?? {};
  }

  private alignJobData(job: Job) {
    if (typeof job?.attemptsMade === 'number') {
      job.attemptsMade++;
    }
    return job;
  }
}
