import BullQueue, { Job, JobOptions, Queue } from 'bull';
import {
  AppJobScheduler,
  JobCleanStatus,
  JobCounts,
  JobSchedulerRepeatOptions,
  JobSchedulerUpdateResult,
  JobStatus,
  MetricsType,
  ObliterateOptions,
  QueueAdapterOptions,
  QueueDefaultJobOptions,
  QueueJob,
  QueueJobOptions,
  QueueMetrics,
  QueueWorker,
  Status,
} from '../../typings/app';
import { STATUSES } from '../constants/statuses';
import { BaseAdapter } from './base';

// `prevMillis` is written by Bull onto every repeatable run but missing from its types.
function repeatOptionsOf(job: Job): JobOptions & { prevMillis?: number } {
  return (job?.opts ?? {}) as JobOptions & { prevMillis?: number };
}

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

  public async getWorkers(): Promise<QueueWorker[] | null> {
    const clients = await this.queue.getWorkers();
    return this.normalizeWorkers(clients as unknown as Record<string, string>[]);
  }

  public async clean(jobStatus: JobCleanStatus, graceTimeMs: number): Promise<any> {
    const armedRuns = await this.getArmedSchedulerRuns();

    if (armedRuns.size === 0) {
      return this.queue.clean(graceTimeMs, jobStatus as any);
    }

    return this.cleanSparingArmedRuns(jobStatus, graceTimeMs, armedRuns);
  }

  public async getArmedJobSchedulerId(job: QueueJob): Promise<string | null> {
    const repeatKey = repeatOptionsOf(job as Job).repeat?.key;

    if (!repeatKey) {
      return null;
    }

    const armedRuns = await this.getArmedSchedulerRuns();

    return this.isArmedSchedulerRun(job as Job, armedRuns) ? repeatKey : null;
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
    const jobs = (await this.queue.getJobs(jobStatuses, start, end)) as (Job | undefined)[];
    return jobs.filter((job): job is Job => !!job).map(this.alignJobData);
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

  public obliterate({ force = false }: ObliterateOptions = {}): Promise<void> {
    return this.queue.obliterate({ force });
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

  public async runJobSchedulerNow(_id: string): Promise<QueueJob | 'not-found'> {
    // Bull keeps no template for a repeatable job, so there is nothing to re-add on demand.
    throw new Error('Bull does not support running a repeatable job on demand');
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

  private async getArmedSchedulerRuns(): Promise<Map<string, number>> {
    const repeatables = await this.queue.getRepeatableJobs();

    return new Map(repeatables.map((repeatable) => [repeatable.key, repeatable.next]));
  }

  private isArmedSchedulerRun(job: Job, armedRuns: Map<string, number>): boolean {
    const { repeat, prevMillis } = repeatOptionsOf(job);

    return !!repeat?.key && armedRuns.get(repeat.key) === prevMillis;
  }

  private async cleanSparingArmedRuns(
    jobStatus: JobCleanStatus,
    graceTimeMs: number,
    armedRuns: Map<string, number>
  ): Promise<string[]> {
    const jobs = await this.queue.getJobs([jobStatus as any]);
    const maxTimestamp = Date.now() - graceTimeMs;
    const removed: string[] = [];

    for (const job of jobs) {
      if (!job || this.isArmedSchedulerRun(job, armedRuns)) {
        continue;
      }

      const timestamp = job.finishedOn ?? job.processedOn ?? job.timestamp;

      if (timestamp && timestamp >= maxTimestamp) {
        continue;
      }

      try {
        await job.remove();
        removed.push(String(job.id));
      } catch {
        // Locked by a worker, which Bull's own sweep skips too.
      }
    }

    return removed;
  }

  private alignJobData(job: Job) {
    if (typeof job?.attemptsMade === 'number') {
      job.attemptsMade++;
    }
    return job;
  }
}
