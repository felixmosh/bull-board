import type { Job, Queue } from 'bullmq';

export type GroupStatusName = 'waiting' | 'limited' | 'maxed' | 'paused';

export interface GroupSummary {
  id: string;
  status: GroupStatusName;
}

export interface GroupSummaryWithCount {
  id: string;
  count: number;
}

export interface GroupsCountByStatus {
  waiting: number;
  limited: number;
  maxed: number;
  paused: number;
}

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
