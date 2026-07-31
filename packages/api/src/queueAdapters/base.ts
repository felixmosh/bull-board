import {
  AppJobScheduler,
  BullBoardRequest,
  FormatterField,
  JobCleanStatus,
  JobCounts,
  JobSchedulerRepeatOptions,
  JobSchedulerUpdateResult,
  JobStatus,
  MetricsType,
  QueueAdapterOptions,
  QueueDefaultJobOptions,
  QueueJob,
  QueueJobOptions,
  QueueMetrics,
  QueueType,
  QueueWorker,
  Status,
} from '../../typings/app';

type RawClient = Record<string, string>;

export abstract class BaseAdapter {
  public readonly readOnlyMode: boolean;
  public readonly allowRetries: boolean;
  public readonly allowCompletedRetries: boolean;
  public readonly prefix: string;
  public readonly delimiter: string;
  public readonly description: string;
  public readonly displayName: string;
  public readonly jobDataSchema: QueueAdapterOptions['jobDataSchema'] | undefined;
  public readonly type: QueueType;
  public readonly externalJobUrl: QueueAdapterOptions['externalJobUrl'];
  private formatters = new Map<FormatterField, (data: any) => any>();
  private _visibilityGuard: (request: BullBoardRequest) => Promise<boolean> | boolean = () => true;

  protected constructor(
    type: QueueType,
    options: Partial<QueueAdapterOptions & { allowCompletedRetries: boolean }> = {}
  ) {
    this.readOnlyMode = options.readOnlyMode === true;
    this.allowRetries = this.readOnlyMode ? false : options.allowRetries !== false;
    this.allowCompletedRetries = this.allowRetries && options.allowCompletedRetries !== false;
    this.prefix = options.prefix || '';
    this.delimiter = options.delimiter || '';
    this.description = options.description || '';
    this.displayName = options.displayName || '';
    this.jobDataSchema = options.jobDataSchema;
    this.type = type;
    this.externalJobUrl = options.externalJobUrl;
  }

  public getDescription(): string {
    return this.description;
  }

  public getDisplayName(): string {
    return this.displayName;
  }

  public getJobDataSchema(): Record<string, any> | undefined {
    return this.jobDataSchema;
  }

  public setFormatter<T extends FormatterField>(
    field: T,
    formatter: (data: any) => T extends 'name' ? string : any
  ): void {
    this.formatters.set(field, formatter);
  }

  public format(field: FormatterField, data: any, defaultValue = data): any {
    const fieldFormatter = this.formatters.get(field);
    return typeof fieldFormatter === 'function' ? fieldFormatter(data) : defaultValue;
  }

  public setVisibilityGuard(guard: (request: BullBoardRequest) => Promise<boolean> | boolean) {
    this._visibilityGuard = guard;
  }

  public isVisible(request: BullBoardRequest) {
    return this._visibilityGuard(request);
  }

  public abstract clean(queueStatus: JobCleanStatus, graceTimeMs: number): Promise<void>;

  public abstract addJob(name: string, data: any, options: QueueJobOptions): Promise<QueueJob>;

  public abstract getJob(id: string): Promise<QueueJob | undefined | null>;

  public abstract getJobCounts(): Promise<JobCounts>;

  public abstract getJobs(
    jobStatuses: JobStatus[],
    start?: number,
    end?: number
  ): Promise<QueueJob[]>;

  public abstract getJobLogs(id: string): Promise<string[]>;

  public abstract getMetrics(
    type: MetricsType,
    start?: number,
    end?: number
  ): Promise<QueueMetrics>;

  public abstract getName(): string;

  public abstract getRedisInfo(): Promise<string>;

  public abstract isPaused(): Promise<boolean>;

  public abstract pause(): Promise<void>;

  public abstract resume(): Promise<void>;

  public abstract empty(): Promise<void>;

  public abstract obliterate(): Promise<void>;

  public abstract promoteAll(): Promise<void>;

  public abstract removeJobScheduler(id: string): Promise<boolean>;

  /**
   * Schedulers of this queue, without their runs. Returned as a plain list because there are
   * rarely enough of them to page through.
   */
  public abstract getJobSchedulers(): Promise<Omit<AppJobScheduler, 'queueName'>[]>;

  public abstract getJobSchedulersCount(): Promise<number>;

  /**
   * Rewrites the schedule of an existing scheduler, leaving the job it produces untouched.
   * Adapters that cannot do this leave {@link supportsJobSchedulerUpdate} false and are never
   * asked.
   */
  public abstract updateJobScheduler(
    id: string,
    repeat: JobSchedulerRepeatOptions
  ): Promise<JobSchedulerUpdateResult>;

  /** Whether {@link updateJobScheduler} does anything. False for Bull, which has no upsert. */
  public get supportsJobSchedulerUpdate(): boolean {
    return false;
  }

  public abstract getStatuses(): Status[];

  public abstract getJobStatuses(): JobStatus[];

  public abstract getGlobalConcurrency(): Promise<number | null>;

  public abstract setGlobalConcurrency(concurrency: number): Promise<void>;

  public getQueueDefaultJobOptions(): QueueDefaultJobOptions {
    return {};
  }

  /**
   * Connected workers for this queue, or `null` when the queue cannot answer.
   * Adapters that have no notion of workers keep the default so the UI can tell
   * "unknown" apart from "nobody is consuming this queue".
   */
  public async getWorkers(): Promise<QueueWorker[] | null> {
    return null;
  }

  /**
   * Turns raw `CLIENT LIST` entries into the shape the board renders.
   *
   * Redis providers that block `CLIENT LIST` make Bull resolve to `undefined` and
   * BullMQ to a single placeholder entry with nothing but a message in `name`.
   * Both are reported as `null` rather than as an empty worker list.
   *
   * `nameSeparator` is what the library puts between the queue part of a connection name
   * and the name the worker was created with. Only libraries that support naming a worker
   * pass one; without it every worker is reported as unnamed.
   */
  protected normalizeWorkers(
    clients: RawClient[] | undefined | null,
    nameSeparator?: string
  ): QueueWorker[] | null {
    if (!Array.isArray(clients)) {
      return null;
    }

    const connections = clients.filter((client) => !!client.addr);
    if (clients.length > 0 && connections.length === 0) {
      return null;
    }

    return connections.map((client) => {
      const connectionName = client.rawname || client.name || '';
      const separatorAt = nameSeparator ? connectionName.indexOf(nameSeparator) : -1;

      return {
        id: client.id,
        name: separatorAt === -1 ? null : connectionName.slice(separatorAt + nameSeparator!.length),
        addr: client.addr,
        age: +client.age || 0,
      };
    });
  }
}
