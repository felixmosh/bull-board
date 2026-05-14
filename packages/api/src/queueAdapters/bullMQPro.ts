import type { Job, Queue } from 'bullmq';

import {
  JobCleanStatus,
  JobCounts,
  JobStatus,
  QueueAdapterOptions,
  QueueJobOptions,
} from '../../typings/app';
import { STATUSES } from '../constants/statuses';
import { BullMQAdapter } from './bullMQ';
import type {
  GroupsCountByStatus,
  GroupStatusName,
  JobProLike,
  QueueProLike,
} from './bullMQProTypes';

const GROUP_COUNTS_TTL_MS = 5_000;

const BUCKET_TO_GROUP_STATUSES: Partial<Record<JobStatus, GroupStatusName[]>> = {
  [STATUSES.waiting]: ['waiting'],
  [STATUSES.delayed]: ['limited', 'maxed'],
  [STATUSES.paused]: ['paused'],
};

interface CachedGroupCounts {
  fetchedAt: number;
  value: GroupsCountByStatus;
}

export class BullMQProAdapter extends BullMQAdapter {
  public readonly isPro = true;
  private readonly proQueue: QueueProLike;
  private groupCountsCache: CachedGroupCounts | null = null;

  constructor(queue: QueueProLike, options: Partial<QueueAdapterOptions> = {}) {
    super(queue as unknown as Queue, options);
    this.proQueue = queue;

    this.setFormatter('name', (jobProps: any) => {
      const gid = jobProps?.opts?.group?.id;
      const baseName = jobProps?.name ?? '';
      return gid != null ? `${baseName} (group: ${gid})` : baseName;
    });
  }

  public async getJobCounts(): Promise<JobCounts> {
    const [base, groups] = await Promise.all([super.getJobCounts(), this.getGroupCounts()]);
    return {
      ...base,
      [STATUSES.waiting]: (base[STATUSES.waiting] ?? 0) + groups.waiting,
      [STATUSES.delayed]: (base[STATUSES.delayed] ?? 0) + groups.limited + groups.maxed,
      [STATUSES.paused]: (base[STATUSES.paused] ?? 0) + groups.paused,
    };
  }

  public async getJobs(
    jobStatuses: JobStatus[],
    start = 0,
    end = -1
  ): Promise<Job[]> {
    const requestedEnd = end;
    const normalizedEnd = end === -1 ? Number.MAX_SAFE_INTEGER : end;
    const pageSize = normalizedEnd - start + 1;

    const groupStatuses = this.getRelevantGroupStatuses(jobStatuses);

    if (groupStatuses.length === 0) {
      return super.getJobs(jobStatuses, start, requestedEnd);
    }

    const counts = await super.getJobCounts();
    const regularCount = jobStatuses.reduce((sum, status) => sum + (counts[status] ?? 0), 0);

    const regularJobs: Job[] =
      start < regularCount
        ? await super.getJobs(jobStatuses, start, Math.min(normalizedEnd, regularCount - 1))
        : [];

    const groupSkip = Math.max(0, start - regularCount);
    const groupTake = pageSize - regularJobs.length;

    if (groupTake <= 0) {
      return regularJobs;
    }

    const groupJobs = await this.fetchJobsFromGroups(groupStatuses, groupSkip, groupTake);
    return [...regularJobs, ...groupJobs];
  }

  public addJob(name: string, data: any, options: QueueJobOptions) {
    this.invalidateGroupCounts();
    return super.addJob(name, data, options);
  }

  public async clean(jobStatus: JobCleanStatus, graceTimeMs: number): Promise<void> {
    this.invalidateGroupCounts();
    return super.clean(jobStatus, graceTimeMs);
  }

  public async empty(): Promise<void> {
    this.invalidateGroupCounts();
    return super.empty();
  }

  public async obliterate(): Promise<void> {
    this.invalidateGroupCounts();
    return super.obliterate();
  }

  public async pause(): Promise<void> {
    this.invalidateGroupCounts();
    return super.pause();
  }

  public async resume(): Promise<void> {
    this.invalidateGroupCounts();
    return super.resume();
  }

  public async promoteAll(): Promise<void> {
    this.invalidateGroupCounts();
    return super.promoteAll();
  }

  private invalidateGroupCounts(): void {
    this.groupCountsCache = null;
  }

  private async getGroupCounts(): Promise<GroupsCountByStatus> {
    const now = Date.now();
    if (this.groupCountsCache && now - this.groupCountsCache.fetchedAt < GROUP_COUNTS_TTL_MS) {
      return this.groupCountsCache.value;
    }
    const value = await this.proQueue.getGroupsCountByStatus();
    this.groupCountsCache = { fetchedAt: now, value };
    return value;
  }

  private getRelevantGroupStatuses(jobStatuses: JobStatus[]): GroupStatusName[] {
    const result = new Set<GroupStatusName>();
    for (const status of jobStatuses) {
      const mapped = BUCKET_TO_GROUP_STATUSES[status];
      if (mapped) {
        for (const groupStatus of mapped) {
          result.add(groupStatus);
        }
      }
    }
    return [...result];
  }

  private async fetchJobsFromGroups(
    groupStatuses: GroupStatusName[],
    skip: number,
    take: number
  ): Promise<JobProLike[]> {
    const collected: JobProLike[] = [];
    let remainingSkip = skip;
    let remainingTake = take;

    for (const groupStatus of groupStatuses) {
      if (remainingTake <= 0) break;

      const groups = await this.proQueue.getGroupsByStatus(groupStatus);

      for (const group of groups) {
        if (remainingTake <= 0) break;

        if (remainingSkip >= group.count) {
          remainingSkip -= group.count;
          continue;
        }

        const groupStart = remainingSkip;
        const groupEnd = Math.min(group.count - 1, groupStart + remainingTake - 1);
        const jobs = await this.proQueue.getGroupJobs(group.id, groupStart, groupEnd);

        collected.push(...jobs);
        remainingSkip = 0;
        remainingTake -= jobs.length;
      }
    }

    return collected;
  }
}

// Provide a no-op reference to keep the import live for downstream tooling
// that walks the JobProLike type. Required because TS-only imports get erased.
export type { JobProLike, QueueProLike } from './bullMQProTypes';
