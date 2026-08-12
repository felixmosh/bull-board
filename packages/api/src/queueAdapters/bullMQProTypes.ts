import type { Job, Queue } from 'bullmq';

export type GroupStatusName = 'waiting' | 'limited' | 'maxed' | 'paused';

export interface GroupSummary {
  id: string;
  status: GroupStatusName;
}

export interface GroupSummaryWithCount {
  id: string;
  /**
   * Number of jobs held by this group. Only returned by bullmq-pro >= 7.46.3; older versions
   * return the id alone, hence optional -- the adapter asks `getGroupJobsCount()` for the
   * groups that arrive without one.
   */
  count?: number;
}

/** Number of *groups* in each group status, as reported by `getGroupsCountByStatus()`. */
export interface GroupsCountByStatus {
  waiting: number;
  limited: number;
  maxed: number;
  paused: number;
}

/**
 * The part of `QueuePro` the adapter calls, and only that part, so that a wrapper or a test
 * double has nothing dead to implement.
 *
 * `GroupSummary` and `GroupsCountByStatus` above describe `getGroups()` and
 * `getGroupsCountByStatus()`, which the adapter deliberately does not use (see
 * `listGroups()` in bullMQPro.ts); they stay exported because they are part of the published
 * types.
 */
export interface QueueProLike extends Queue {
  getGroupsByStatus(
    status: GroupStatusName,
    start?: number,
    end?: number
  ): Promise<GroupSummaryWithCount[]>;
  getGroupJobs(groupId: string | number, start?: number, end?: number): Promise<JobProLike[]>;
  getGroupJobsCount(groupId: string | number): Promise<number>;
}

export interface JobProLike extends Job {
  gid?: string | number;
  opts: Job['opts'] & {
    group?: { id: string | number };
  };
}
