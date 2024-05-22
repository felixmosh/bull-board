import {
  FormatterField,
  JobCleanStatus,
  JobCounts,
  JobStatus,
  QueueAdapterOptions,
  QueueJob,
  QueueJobOptions,
  QueueType,
  Status,
} from '../../typings/app';

export abstract class BaseAdapter {
  public readonly readOnlyMode: boolean;
  public readonly allowRetries: boolean;
  public readonly allowCompletedRetries: boolean;
  public readonly prefix: string;
  public readonly description: string;
  public readonly type: QueueType;
  private formatters = new Map<FormatterField, (data: any) => any>();

  protected constructor(
    type: QueueType,
    options: Partial<QueueAdapterOptions & { allowCompletedRetries: boolean }> = {}
  ) {
    this.readOnlyMode = options.readOnlyMode === true;
    this.allowRetries = this.readOnlyMode ? false : options.allowRetries !== false;
    this.allowCompletedRetries = this.allowRetries && options.allowCompletedRetries !== false;
    this.prefix = options.prefix || '';
    this.description = options.description || '';
    this.type = type;
  }

  public getDescription(): string {
    return this.description;
  }

  public setFormatter<T extends FormatterField>(
    field: T,
    formatter: (data: any) => T extends 'name' ? string : any
  ): void {
    this.formatters.set(field, formatter);
  }

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  public format(field: FormatterField, data: any, defaultValue = data): any {
    const fieldFormatter = this.formatters.get(field);
    return typeof fieldFormatter === 'function' ? fieldFormatter(data) : defaultValue;
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

  public abstract getName(): string;

  public abstract getRedisInfo(): Promise<string>;

  public abstract isPaused(): Promise<boolean>;

  public abstract pause(): Promise<void>;

  public abstract resume(): Promise<void>;

  public abstract empty(): Promise<void>;

  public abstract promoteAll(): Promise<void>;

  public abstract getStatuses(): Status[];

  public abstract getJobStatuses(): JobStatus[];
}
