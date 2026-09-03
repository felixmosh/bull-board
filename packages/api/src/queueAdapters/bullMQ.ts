import { FlowProducer, Job, JobSchedulerJson, Queue, type RedisClient } from 'bullmq';
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
  QueueRateLimit,
  QueueWorker,
  RedisStats,
  Status,
} from '../../typings/app';
import { DATASTORES } from '../constants/datastores';
import { STATUSES } from '../constants/statuses';
import { BaseAdapter } from './base';

/** The `:w:<name>` suffix BullMQ appends to the connection name of a named worker. */
const WORKER_NAME_SEPARATOR = ':w:';

// v5 exposes the Redis connection on `Queue#client`; v6 moved it behind pluggable backends.
interface VersionedQueue {
  client?: Promise<RedisClient>;
  getBackend?: () =>
    | { client?: Promise<RedisClient>; connection?: { pool?: QueryablePool } }
    | undefined;
}

interface QueryablePool {
  query(sql: string): Promise<{ rows: Record<string, any>[] }>;
}

interface RateLimitedQueue {
  getGlobalRateLimit?: () => Promise<QueueRateLimit | null>;
  setGlobalRateLimit?: (max: number, duration: number) => Promise<number>;
  removeGlobalRateLimit?: () => Promise<number>;
}

type FlowProducerWithBackend = new (
  opts: Queue['opts'],
  backendFactory: () => unknown
) => FlowProducer;

// One producer per connection, however many adapters share it: each producer pins listeners on
// the client (or backend) and is never closed, so the entry must die with the connection.
const flowProducerCache = new WeakMap<object, FlowProducer>();

const POSTGRES_STATS_SQL = `
  SELECT split_part(current_setting('server_version'), ' ', 1) AS version,
         current_setting('port') AS port,
         extract(epoch from now() - pg_postmaster_start_time())::int AS uptime,
         (SELECT count(*) FROM pg_stat_activity) AS connected,
         (SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock') AS blocked
`;

export class BullMQAdapter extends BaseAdapter {
  constructor(
    private queue: Queue,
    options: Partial<QueueAdapterOptions> = {}
  ) {
    const libName = 'bullmq';
    super(libName, options);
    if (
      !(queue instanceof Queue || `${(queue as Queue).metaValues?.version}`?.startsWith(libName))
    ) {
      throw new Error(`You've used the BullMQ adapter with a non-BullMQ queue.`);
    }
  }

  public async getRedisInfo(): Promise<string | null> {
    const client = await this.resolveRedisClient();
    return client ? client.info() : null;
  }

  private async resolveRedisClient(): Promise<RedisClient | null> {
    const queue = this.queue as unknown as VersionedQueue;

    if (typeof queue.getBackend === 'function') {
      return (await queue.getBackend()?.client) ?? null;
    }

    return (await queue.client) ?? null;
  }

  public override async getDatastoreStats(): Promise<RedisStats | null> {
    const pool = (this.queue as unknown as VersionedQueue).getBackend?.()?.connection?.pool;

    if (!pool) {
      return null;
    }

    const [row] = (await pool.query(POSTGRES_STATS_SQL)).rows;

    return {
      backend: DATASTORES.postgres,
      version: String(row.version),
      port: Number(row.port),
      uptime: Number(row.uptime),
      clients: { connected: Number(row.connected), blocked: Number(row.blocked) },
    };
  }

  // BullMQ v6 dropped the paused job state; a paused queue's jobs are stored as waiting.
  private get hasPausedState(): boolean {
    return typeof (this.queue as unknown as VersionedQueue).getBackend !== 'function';
  }

  public getName(): string {
    return `${this.prefix}${this.queue.name}`;
  }

  public async getWorkers(): Promise<QueueWorker[] | null> {
    const clients = await this.queue.getWorkers();
    return this.normalizeWorkers(
      clients as unknown as Record<string, string>[],
      WORKER_NAME_SEPARATOR
    );
  }

  public async clean(jobStatus: JobCleanStatus, graceTimeMs: number): Promise<void> {
    await this.queue.clean(graceTimeMs, Number.MAX_SAFE_INTEGER, jobStatus);
  }

  public addJob(name: string, data: any, options: QueueJobOptions) {
    return this.queue.add(name, data, options);
  }

  public getJob(id: string): Promise<Job | undefined> {
    return this.queue.getJob(id);
  }

  public async getJobs(jobStatuses: JobStatus[], start?: number, end?: number): Promise<Job[]> {
    const jobs = (await this.queue.getJobs(jobStatuses, start, end)) as (Job | undefined)[];
    return jobs.filter((job): job is Job => !!job);
  }

  public getJobCounts(): Promise<JobCounts> {
    return this.queue.getJobCounts() as unknown as Promise<JobCounts>;
  }

  public getJobLogs(id: string): Promise<string[]> {
    return this.queue.getJobLogs(id).then(({ logs }) => logs);
  }

  public getMetrics(type: MetricsType, start?: number, end?: number): Promise<QueueMetrics> {
    return this.queue.getMetrics(type, start, end);
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

  public obliterate({ force = false }: ObliterateOptions = {}): Promise<void> {
    return this.queue.obliterate({ force });
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

  public removeJobScheduler(id: string): Promise<boolean> {
    return this.queue.removeJobScheduler(id);
  }

  /**
   * Worked out from the ids BullMQ derives rather than from the error `Job#remove` raises, whose
   * numeric code only exists in newer BullMQ. Removing the run a scheduler is waiting on would
   * leave the scheduler registered and unable to fire again; past runs of the same scheduler carry
   * the same `repeatJobKey` and are ordinary jobs.
   */
  public override async getArmedJobSchedulerId(job: QueueJob): Promise<string | null> {
    const { id, repeatJobKey } = job as Job;

    if (!id || !repeatJobKey) {
      return null;
    }

    const scheduler = await this.queue.getJobScheduler(repeatJobKey).catch(() => null);

    return scheduler?.next && this.schedulerRunId(repeatJobKey, scheduler.next) === id
      ? repeatJobKey
      : null;
  }

  public async getJobSchedulers(): Promise<Omit<AppJobScheduler, 'queueName'>[]> {
    const schedulers = await this.queue.getJobSchedulers(0, -1);

    return Promise.all(
      schedulers.map(async (scheduler) => ({
        id: scheduler.key,
        name: scheduler.name,
        pattern: scheduler.pattern,
        every: scheduler.every,
        tz: scheduler.tz,
        limit: scheduler.limit,
        startDate: scheduler.startDate,
        endDate: scheduler.endDate,
        next: scheduler.next ?? undefined,
        iterationCount: scheduler.iterationCount,
        template: scheduler.template,
        ...(await this.getSchedulerRuns(scheduler)),
      }))
    );
  }

  public getJobSchedulersCount(): Promise<number> {
    return this.queue.getJobSchedulersCount();
  }

  public override get supportsJobSchedulerUpdate(): boolean {
    return true;
  }

  public override get supportsJobSchedulerRun(): boolean {
    return true;
  }

  public async runJobSchedulerNow(id: string): Promise<QueueJob | 'not-found'> {
    const scheduler = await this.queue.getJobScheduler(id);

    if (!scheduler) {
      return 'not-found';
    }

    // BullMQ already strips `repeat`, `jobId` and `delay` from a stored template, so what this
    // adds is an ordinary one-off job and the schedule keeps the pending run it was holding.
    return this.queue.add(scheduler.name, scheduler.template?.data, scheduler.template?.opts);
  }

  public async updateJobScheduler(
    id: string,
    repeat: JobSchedulerRepeatOptions
  ): Promise<JobSchedulerUpdateResult> {
    const current = await this.queue.getJobScheduler(id);

    if (!current) {
      return 'not-found';
    }

    // The template is re-sent as it is stored: an upsert that omits it would drop the job name,
    // data and options the app registered.
    const template = {
      name: current.name,
      data: current.template?.data,
      opts: current.template?.opts,
    };

    let next;
    try {
      next = await this.queue.upsertJobScheduler(id, repeat, template);
    } catch (error) {
      // BullMQ works out the next fire time before it writes anything, so a cron it cannot parse
      // throws with the stored scheduler untouched. Anything thrown for an interval schedule
      // happened while writing and is a real failure.
      if (!repeat.pattern) {
        throw error;
      }
      return 'invalid-schedule';
    }

    // A schedule that can never fire again, an end date in the past for instance, is answered
    // with nothing at all rather than an error.
    return next ? 'updated' : 'invalid-schedule';
  }

  /**
   * What the dashboard can say about a scheduler's runs, all of it worked out from the ids
   * BullMQ derives, `repeat:<schedulerId>:<scheduled millis>`.
   *
   * The next run is the delayed job waiting at `scheduler.next`. BullMQ stores no last-run time,
   * but it creates that delayed job the moment the previous run moves to active, so the job's
   * `timestamp` is when the previous run started. `iterationCount` of 1 means the job came from
   * the application's own upsert rather than from a run, and a scheduler past its limit or end
   * date has no pending job left at all.
   */
  private async getSchedulerRuns(
    scheduler: JobSchedulerJson
  ): Promise<Pick<AppJobScheduler, 'nextRunJobId' | 'lastRun' | 'lastRunJobId'>> {
    if (!scheduler.next) {
      return {};
    }

    const pendingRun = await this.queue.getJob(this.schedulerRunId(scheduler.key, scheduler.next));

    if (!pendingRun) {
      return {};
    }

    const hasRun = !!scheduler.iterationCount && scheduler.iterationCount > 1;

    return {
      nextRunJobId: pendingRun.id,
      ...(hasRun
        ? { lastRun: pendingRun.timestamp, lastRunJobId: await this.findLastRunId(scheduler) }
        : {}),
    };
  }

  /**
   * The previous run's id, but only when it can be named and the job is still there. Interval
   * schedules fire exactly `every` milliseconds apart, so the previous id follows from the next
   * one; a cron pattern would have to be parsed to say the same, which is not worth a dependency
   * for a job that `removeOnComplete` has usually deleted anyway.
   */
  private async findLastRunId(scheduler: JobSchedulerJson): Promise<string | undefined> {
    if (!scheduler.every || !scheduler.next) {
      return undefined;
    }

    const previousRun = await this.queue.getJob(
      this.schedulerRunId(scheduler.key, scheduler.next - scheduler.every)
    );

    return previousRun?.id;
  }

  private schedulerRunId(schedulerId: string, millis: number): string {
    return `repeat:${schedulerId}:${millis}`;
  }

  public getStatuses(): Status[] {
    return [STATUSES.latest, ...this.getJobStatuses()];
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
      ...(this.hasPausedState ? [STATUSES.paused] : []),
    ];
  }

  public getClient(): Promise<RedisClient | null> {
    return this.resolveRedisClient();
  }

  public async getFlowProducer(): Promise<FlowProducer | null> {
    const queue = this.queue as unknown as VersionedQueue;

    // v6: reuse the queue's backend, so the producer works on any datastore, Redis or not.
    if (typeof queue.getBackend === 'function') {
      const backend = queue.getBackend();
      if (!backend) return null;

      let producer = flowProducerCache.get(backend);
      if (!producer) {
        producer = new (FlowProducer as unknown as FlowProducerWithBackend)(
          this.queue.opts,
          () => backend
        );
        flowProducerCache.set(backend, producer);
      }
      return producer;
    }

    const client = await queue.client;
    if (!client) return null;

    let producer = flowProducerCache.get(client);
    if (!producer) {
      const prefix = this.getQueuePrefix();
      producer = new FlowProducer({ connection: client, ...(prefix ? { prefix } : {}) });
      flowProducerCache.set(client, producer);
    }
    return producer;
  }

  public getQueuePrefix(): string | undefined {
    return this.queue.opts?.prefix;
  }

  /**
   * Fully prefixed Redis key for one of the queue's sets, for example `bull:MyQueue:completed`.
   * Exposed for @bull-board/metrics, which scans the completed and failed sorted sets
   * directly rather than paging whole Job objects through getJobs.
   */
  public getQueueKey(set: string): string {
    return this.queue.toKey(set);
  }

  public getGlobalConcurrency(): Promise<number | null> {
    return this.queue.getGlobalConcurrency?.() || null;
  }

  public override get supportsGlobalRateLimit(): boolean {
    return typeof (this.queue as RateLimitedQueue).setGlobalRateLimit === 'function';
  }

  public override async getConfiguredRateLimit(): Promise<QueueRateLimit | null> {
    return (await (this.queue as RateLimitedQueue).getGlobalRateLimit?.()) ?? null;
  }

  public override async setConfiguredRateLimit({ max, duration }: QueueRateLimit): Promise<void> {
    await (this.queue as RateLimitedQueue).setGlobalRateLimit?.(max, duration);
  }

  public override async removeConfiguredRateLimit(): Promise<void> {
    await (this.queue as RateLimitedQueue).removeGlobalRateLimit?.();
  }

  public override async getActiveRateLimitTtl(): Promise<number> {
    const ttl = await this.queue.getRateLimitTtl();
    return ttl > 0 ? ttl : 0;
  }

  public override async releaseActiveRateLimit(): Promise<void> {
    await this.queue.removeRateLimitKey();
  }

  public getQueueDefaultJobOptions(): QueueDefaultJobOptions {
    return (this.queue.opts.defaultJobOptions as QueueDefaultJobOptions) ?? {};
  }

  public async setGlobalConcurrency(concurrency: number): Promise<void> {
    if (concurrency <= 0) {
      await this.queue.removeGlobalConcurrency?.();
    } else {
      await this.queue.setGlobalConcurrency?.(concurrency);
    }
  }
}
