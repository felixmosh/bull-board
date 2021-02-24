import { Job } from 'bull'
import { Job as JobMq } from 'bullmq'
import {
  JobCleanStatus,
  JobCounts,
  JobStatus,
  QueueAdapter,
  QueueAdapterOptions,
} from '../@types/app'
import * as Redis from 'ioredis'

export abstract class BaseAdapter implements QueueAdapter {
  public readonly readOnlyMode: boolean
  private formatters: Record<string, (data: any) => any> = {}

  protected constructor(options: Partial<QueueAdapterOptions> = {}) {
    this.readOnlyMode = options.readOnlyMode === true
  }

  public setFormatter(
    field: 'data' | 'returnValue',
    formatter: (data: any) => any,
  ): void {
    this.formatters[field] = formatter
  }

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  public format(field: 'data' | 'returnValue', data: any): any {
    return typeof this.formatters[field] === 'function'
      ? this.formatters[field](data)
      : data
  }

  public abstract clean(
    queueStatus: JobCleanStatus,
    graceTimeMs: number,
  ): Promise<void>

  public abstract getJob(id: string): Promise<Job | JobMq | undefined | null>

  public abstract getJobCounts(...jobStatuses: JobStatus[]): Promise<JobCounts>

  public abstract getJobs(
    jobStatuses: JobStatus[],
    start?: number,
    end?: number,
  ): Promise<(Job | JobMq)[]>

  public abstract getName(): string

  public abstract getClient(): Promise<Redis.Redis>
}
