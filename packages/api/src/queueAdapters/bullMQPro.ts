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
  GroupStatusName,
  GroupSummaryWithCount,
  JobProLike,
  QueueProLike,
} from './bullMQProTypes';

const SNAPSHOT_TTL_MS = 5_000;

const BUCKET_TO_GROUP_STATUSES: Partial<Record<JobStatus, GroupStatusName[]>> = {
  [STATUSES.waiting]: ['waiting'],
  [STATUSES.delayed]: ['limited', 'maxed'],
  [STATUSES.paused]: ['paused'],
};

/** A group and the number of jobs it holds, once that number is known. */
interface GroupWithJobCount {
  id: string;
  count: number;
}

/**
 * One reading of the queue: the counts BullMQ reports for the ungrouped jobs, and every group
 * with the jobs it holds.
 *
 * Both halves are read together because pagination is worked out from the counts and then
 * applied to the groups. The object literals building it are typed as
 * `Record<GroupStatusName, ...>`, so a group status added to the union is a compile error here
 * rather than a key that silently goes missing and totals up as `NaN`.
 */
interface QueueSnapshot {
  counts: JobCounts;
  groups: Record<GroupStatusName, GroupWithJobCount[]>;
}

/**
 * The job count bullmq-pro put next to a group, or `null` when there is none to be had.
 *
 * `getGroupsByStatus()` only returns `count` from 7.46.3 on, and values that come back out of a
 * Lua script can arrive as strings, so it is coerced rather than trusted: `Number.isFinite()`
 * alone would read `"15"` as no count at all.
 */
function reportedJobCount(group: GroupSummaryWithCount): number | null {
  const count = Number(group.count);
  return Number.isFinite(count) && count >= 0 ? count : null;
}

function sumJobCounts(groups: GroupWithJobCount[]): number {
  return groups.reduce((total, group) => total + group.count, 0);
}

export class BullMQProAdapter extends BullMQAdapter {
  public readonly isPro = true;
  private readonly proQueue: QueueProLike;
  private snapshotCache: { fetchedAt: number; value: Promise<QueueSnapshot> } | null = null;

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
    const { counts, groups } = await this.getSnapshot();
    return {
      ...counts,
      [STATUSES.waiting]: (counts[STATUSES.waiting] ?? 0) + sumJobCounts(groups.waiting),
      [STATUSES.delayed]:
        (counts[STATUSES.delayed] ?? 0) + sumJobCounts(groups.limited) + sumJobCounts(groups.maxed),
      [STATUSES.paused]: (counts[STATUSES.paused] ?? 0) + sumJobCounts(groups.paused),
    };
  }

  public async getJobs(jobStatuses: JobStatus[], start = 0, end = -1): Promise<Job[]> {
    const groupStatuses = this.getRelevantGroupStatuses(jobStatuses);

    if (groupStatuses.length === 0) {
      return super.getJobs(jobStatuses, start, end);
    }

    const normalizedEnd = end === -1 ? Number.MAX_SAFE_INTEGER : end;
    const pageSize = normalizedEnd - start + 1;

    // The same reading `getJobCounts()` served, so the ungrouped/grouped boundary this page is
    // cut at is the one the caller's pagination was computed from.
    const snapshot = await this.getSnapshot();
    const regularCount = jobStatuses.reduce(
      (sum, status) => sum + (snapshot.counts[status] ?? 0),
      0
    );

    const regularJobs: Job[] =
      start < regularCount
        ? await super.getJobs(jobStatuses, start, Math.min(normalizedEnd, regularCount - 1))
        : [];

    const groupSkip = Math.max(0, start - regularCount);
    const groupTake = pageSize - regularJobs.length;

    if (groupTake <= 0) {
      return regularJobs;
    }

    const groupJobs = await this.fetchJobsFromGroups(snapshot, groupStatuses, groupSkip, groupTake);
    return [...regularJobs, ...groupJobs];
  }

  public addJob(name: string, data: any, options: QueueJobOptions) {
    return this.withSnapshotReset(() => super.addJob(name, data, options));
  }

  public async clean(jobStatus: JobCleanStatus, graceTimeMs: number): Promise<void> {
    return this.withSnapshotReset(() => super.clean(jobStatus, graceTimeMs));
  }

  public async empty(): Promise<void> {
    return this.withSnapshotReset(() => super.empty());
  }

  public async obliterate(): Promise<void> {
    return this.withSnapshotReset(() => super.obliterate());
  }

  public async pause(): Promise<void> {
    return this.withSnapshotReset(() => super.pause());
  }

  public async resume(): Promise<void> {
    return this.withSnapshotReset(() => super.resume());
  }

  public async promoteAll(): Promise<void> {
    return this.withSnapshotReset(() => super.promoteAll());
  }

  /**
   * Runs a mutation with the cached reading dropped on both sides of it. Dropping it beforehand
   * is not enough on its own: a poll landing while the write is still in flight would cache the
   * queue as it was and serve that for a whole TTL.
   */
  private async withSnapshotReset<T>(mutation: () => Promise<T>): Promise<T> {
    this.invalidateSnapshot();
    try {
      return await mutation();
    } finally {
      this.invalidateSnapshot();
    }
  }

  private invalidateSnapshot(): void {
    this.snapshotCache = null;
  }

  /**
   * The current reading of the queue, taken at most once every `SNAPSHOT_TTL_MS`.
   *
   * Counting jobs and listing them need the same group listing, and the counts decide where the
   * listing is cut, so both come out of one reading -- otherwise a group that changes status
   * between the two calls is counted twice, or a page skips jobs the count promised.
   *
   * It is the in-flight promise that is cached, so callers arriving together -- two browser tabs
   * polling, say -- share one reading instead of racing to replace each other's.
   */
  private getSnapshot(): Promise<QueueSnapshot> {
    const now = Date.now();
    const cached = this.snapshotCache;

    if (cached && now - cached.fetchedAt < SNAPSHOT_TTL_MS) {
      return cached.value;
    }

    const entry = { fetchedAt: now, value: this.readQueue() };
    this.snapshotCache = entry;

    // A failed reading must not be handed out for the rest of the TTL.
    entry.value.catch(() => {
      if (this.snapshotCache === entry) {
        this.invalidateSnapshot();
      }
    });

    return entry.value;
  }

  private async readQueue(): Promise<QueueSnapshot> {
    const [counts, waiting, limited, maxed, paused] = await Promise.all([
      super.getJobCounts(),
      this.listGroups('waiting'),
      this.listGroups('limited'),
      this.listGroups('maxed'),
      this.listGroups('paused'),
    ]);

    return { counts, groups: { waiting, limited, maxed, paused } };
  }

  /**
   * Every group of one status, with the number of jobs it holds.
   *
   * Note this deliberately does not use `getGroupsCountByStatus()`, which counts *groups*
   * rather than the jobs inside them -- folding that into job counts reported one job per group
   * (issue #1346). Only `getGroupsByStatus()` names the groups, so counting the jobs in them
   * costs a listing of every group on every reading; that is what the snapshot TTL bounds.
   *
   * The range is passed explicitly rather than left to the getter's default: the totals are
   * only right if every group is listed.
   */
  private async listGroups(status: GroupStatusName): Promise<GroupWithJobCount[]> {
    const groups = await this.proQueue.getGroupsByStatus(status, 0, -1);

    return Promise.all(
      groups.map(async (group) => ({
        id: group.id,
        count: reportedJobCount(group) ?? (await this.countGroupJobs(group.id)),
      }))
    );
  }

  /**
   * Jobs in one group, asked for outright. Needed on bullmq-pro < 7.46.3, where
   * `getGroupsByStatus()` returns ids alone: assuming one job per group would understate the
   * counts and, since those counts also decide what to read from each group, hide every job in
   * the group but the first. Versions old enough to lack `getGroupJobsCount()` as well keep
   * that one-job-per-group approximation.
   */
  private async countGroupJobs(groupId: string): Promise<number> {
    if (typeof this.proQueue.getGroupJobsCount !== 'function') {
      return 1;
    }

    const count = Number(await this.proQueue.getGroupJobsCount(groupId));
    return Number.isFinite(count) && count >= 0 ? count : 1;
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

  /**
   * A page of jobs taken from the groups, in the order the statuses were asked for.
   *
   * Which slice of which group to read follows from the counts already in the snapshot, so the
   * ranges are all worked out first and the groups then read at once: a page spanning ten
   * groups costs one round trip's latency rather than ten.
   */
  private async fetchJobsFromGroups(
    snapshot: QueueSnapshot,
    groupStatuses: GroupStatusName[],
    skip: number,
    take: number
  ): Promise<JobProLike[]> {
    const ranges: { id: string; start: number; end: number }[] = [];
    let remainingSkip = skip;
    let remainingTake = take;

    for (const groupStatus of groupStatuses) {
      if (remainingTake <= 0) break;

      for (const group of snapshot.groups[groupStatus]) {
        if (remainingTake <= 0) break;

        if (remainingSkip >= group.count) {
          remainingSkip -= group.count;
          continue;
        }

        const start = remainingSkip;
        const end = Math.min(group.count - 1, start + remainingTake - 1);

        ranges.push({ id: group.id, start, end });
        remainingSkip = 0;
        remainingTake -= end - start + 1;
      }
    }

    const pages = await Promise.all(
      ranges.map(({ id, start, end }) => this.proQueue.getGroupJobs(id, start, end))
    );

    // A group can hold fewer jobs than the snapshot said, so the page is trimmed rather than
    // assumed to be exactly `take` long.
    return pages.flat().slice(0, take);
  }
}

// Provide a no-op reference to keep the import live for downstream tooling
// that walks the JobProLike type. Required because TS-only imports get erased.
export type { JobProLike, QueueProLike } from './bullMQProTypes';
