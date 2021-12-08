import {
  FormatterField,
  JobCleanStatus,
  JobCounts,
  JobStatus,
  QueueAdapterOptions,
  QueueJob,
} from '../../typings/app';

export abstract class BaseAdapter {
  public readonly readOnlyMode: boolean;
  public readonly prefix: string;
  private formatters: Record<string, (data: any) => any> = {};

  protected constructor(options: Partial<QueueAdapterOptions> = {}) {
    this.readOnlyMode = options.readOnlyMode === true;
    this.prefix = options.prefix || '';
  }

  public setFormatter(field: FormatterField, formatter: (data: any) => any): void {
    this.formatters[field] = formatter;
  }

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  public format(field: FormatterField, data: any): any {
    const defaultValue = field === 'name' ? data.name : data;
    return typeof this.formatters[field] === 'function'
      ? this.formatters[field](data)
      : defaultValue;
  }

  public abstract clean(queueStatus: JobCleanStatus, graceTimeMs: number): Promise<void>;

  public abstract getJob(id: string): Promise<QueueJob | undefined | null>;

  public abstract getJobCounts(...jobStatuses: JobStatus[]): Promise<JobCounts>;

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
}
