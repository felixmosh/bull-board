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
  GroupJobCountsByStatus,
  GroupStatusName,
  GroupSummaryWithCount,
  JobProLike,
  QueueProLike,
} from './bullMQProTypes';

const GROUPS_TTL_MS = 5_000;

const GROUP_STATUSES: GroupStatusName[] = ['waiting', 'limited', 'maxed', 'paused'];

const BUCKET_TO_GROUP_STATUSES: Partial<Record<JobStatus, GroupStatusName[]>> = {
  [STATUSES.waiting]: ['waiting'],
  [STATUSES.delayed]: ['limited', 'maxed'],
  [STATUSES.paused]: ['paused'],
};

/**
 * Jobs held by a single group.
 *
 * bullmq-pro only started returning `count` from `getGroupsByStatus()` in 7.46.3. On older
 * versions it is missing, and counting the group as one job keeps the totals in the same
 * ballpark -- a group is only listed while it holds jobs -- instead of yielding `NaN`.
 */
function groupJobCount(group: GroupSummaryWithCount): number {
  return Number.isFinite(group.count) ? group.count : 1;
}

function sumGroupJobs(groups: GroupSummaryWithCount[]): number {
  return groups.reduce((total, group) => total + groupJobCount(group), 0);
}

interface CachedGroups {
  fetchedAt: number;
  value: GroupSummaryWithCount[];
}

export class BullMQProAdapter extends BullMQAdapter {
  public readonly isPro = true;
  private readonly proQueue: QueueProLike;
  private readonly groupsCache = new Map<GroupStatusName, CachedGroups>();

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
    const [base, groups] = await Promise.all([super.getJobCounts(), this.getGroupJobCounts()]);
    return {
      ...base,
      [STATUSES.waiting]: (base[STATUSES.waiting] ?? 0) + groups.waiting,
      [STATUSES.delayed]: (base[STATUSES.delayed] ?? 0) + groups.limited + groups.maxed,
      [STATUSES.paused]: (base[STATUSES.paused] ?? 0) + groups.paused,
    };
  }

  public async getJobs(jobStatuses: JobStatus[], start = 0, end = -1): Promise<Job[]> {
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
    this.invalidateGroupsCache();
    return super.addJob(name, data, options);
  }

  public async clean(jobStatus: JobCleanStatus, graceTimeMs: number): Promise<void> {
    this.invalidateGroupsCache();
    return super.clean(jobStatus, graceTimeMs);
  }

  public async empty(): Promise<void> {
    this.invalidateGroupsCache();
    return super.empty();
  }

  public async obliterate(): Promise<void> {
    this.invalidateGroupsCache();
    return super.obliterate();
  }

  public async pause(): Promise<void> {
    this.invalidateGroupsCache();
    return super.pause();
  }

  public async resume(): Promise<void> {
    this.invalidateGroupsCache();
    return super.resume();
  }

  public async promoteAll(): Promise<void> {
    this.invalidateGroupsCache();
    return super.promoteAll();
  }

  private invalidateGroupsCache(): void {
    this.groupsCache.clear();
  }

  /**
   * Number of jobs sitting in the queue's groups, per group status.
   *
   * Note this deliberately does not use `getGroupsCountByStatus()`, which counts *groups*
   * rather than the jobs inside them -- folding that into job counts reported one job per
   * group (issue #1346). `getGroupsByStatus()` returns each group's job count next to its
   * id, so a per-status job total is the sum of those.
   *
   * The four group statuses are disjoint in bullmq-pro (a group moves out of the waiting
   * set when it becomes limited, maxed or paused), so no job is counted twice.
   */
  private async getGroupJobCounts(): Promise<GroupJobCountsByStatus> {
    const entries = await Promise.all(
      GROUP_STATUSES.map(
        async (status) => [status, sumGroupJobs(await this.getCachedGroups(status))] as const
      )
    );
    return Object.fromEntries(entries) as GroupJobCountsByStatus;
  }

  /**
   * Groups of a given status, cached briefly. Counting jobs and listing them both need the
   * same group listing, and serving them from one snapshot keeps a page of jobs consistent
   * with the counts the pagination was computed from.
   */
  private async getCachedGroups(status: GroupStatusName): Promise<GroupSummaryWithCount[]> {
    const now = Date.now();
    const cached = this.groupsCache.get(status);
    if (cached && now - cached.fetchedAt < GROUPS_TTL_MS) {
      return cached.value;
    }
    const value = await this.proQueue.getGroupsByStatus(status);
    this.groupsCache.set(status, { fetchedAt: now, value });
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

      const groups = await this.getCachedGroups(groupStatus);

      for (const group of groups) {
        if (remainingTake <= 0) break;

        const count = groupJobCount(group);

        if (remainingSkip >= count) {
          remainingSkip -= count;
          continue;
        }

        const groupStart = remainingSkip;
        const groupEnd = Math.min(count - 1, groupStart + remainingTake - 1);
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
