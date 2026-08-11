import type { Job, Queue } from 'bullmq';

export type GroupStatusName = 'waiting' | 'limited' | 'maxed' | 'paused';

export interface GroupSummary {
  id: string;
  status: GroupStatusName;
}

export interface GroupSummaryWithCount {
  id: string;
  /**
   * Number of jobs held by this group. Only returned by bullmq-pro >= 7.46.3; older
   * versions return the id alone.
   */
  count: number;
}

/** Number of *groups* in each group status, as reported by `getGroupsCountByStatus()`. */
export interface GroupsCountByStatus {
  waiting: number;
  limited: number;
  maxed: number;
  paused: number;
}

/** Number of *jobs* held by the groups of each group status. */
export type GroupJobCountsByStatus = Record<GroupStatusName, number>;

export interface QueueProLike extends Queue {
  getGroups(start?: number, end?: number): Promise<GroupSummary[]>;
  getGroupsByStatus(
    status: GroupStatusName,
    start?: number,
    end?: number
  ): Promise<GroupSummaryWithCount[]>;
  getGroupsCount(): Promise<number>;
  getGroupsCountByStatus(): Promise<GroupsCountByStatus>;
  getGroupJobs(groupId: string | number, start?: number, end?: number): Promise<JobProLike[]>;
  getGroupJobsCount(groupId: string | number): Promise<number>;
}

export interface JobProLike extends Job {
  gid?: string | number;
  opts: Job['opts'] & {
    group?: { id: string | number };
  };
}
