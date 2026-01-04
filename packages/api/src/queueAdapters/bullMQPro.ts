import type { JobPro, QueuePro, GroupStatus as GroupStatusType } from '@taskforcesh/bullmq-pro';

import {
  JobCleanStatus,
  JobCounts,
  JobStatus,
  QueueAdapterOptions,
  QueueJobOptions,
  Status,
} from '../../typings/app';
import { STATUSES } from '../constants/statuses';
import { BaseAdapter } from './base';

// Configuration for group fetching optimization
const GROUP_CONFIG = {
  CACHE_TTL_MS: 10000, // Cache for 10 seconds
} as const;

// GroupStatus enum values from @taskforcesh/bullmq-pro
// We define them here to avoid runtime dependency issues
const GroupStatus = {
  Waiting: 'waiting' as GroupStatusType,
  Limited: 'limited' as GroupStatusType,
  Maxed: 'maxed' as GroupStatusType,
  Paused: 'paused' as GroupStatusType,
} as const;

/**
 * BullMQ Pro Adapter with support for Groups
 *
 * This adapter extends the standard BullMQ functionality to support BullMQ Pro's
 * Groups feature. Groups create "virtual queues" that allow rate limiting and
 * concurrency control on a per-group basis.
 *
 * Key features:
 * - Displays jobs from groups in the Waiting, Delayed, and Paused tabs
 * - Includes group job counts in the total counts
 * - Uses caching to minimize Redis calls for group operations
 *
 * @see https://github.com/felixmosh/bull-board/issues/874
 */
export class BullMQProAdapter extends BaseAdapter {
  // Simple cache for total group jobs count (for getJobCounts)
  private totalGroupJobsCache: {
    waiting: number;
    delayed: number;
    paused: number;
  } | null = null;
  private totalGroupJobsCacheTimestamp = 0;

  constructor(
    private queue: QueuePro,
    options: Partial<QueueAdapterOptions> = {}
  ) {
    const libName = 'bullmq'; // Doesn't allow any other name besides bullmq & bull
    super(libName, options);
    if (
      !(
        queue instanceof (Object.getPrototypeOf(queue).constructor) ||
        `${(queue as QueuePro).metaValues?.version}`?.startsWith(libName)
      )
    ) {
      throw new Error(`You've used the BullMQ Pro adapter with a non-BullMQ Pro queue.`);
    }
  }

  /**
   * Get group job counts with caching - uses getGroupsByStatus for exact counts
   * 4 Redis calls in parallel for exact results
   */
  private async getCachedGroupCounts(): Promise<{
    waiting: number;
    delayed: number;
    paused: number;
  }> {
    const now = Date.now();
    if (
      this.totalGroupJobsCache &&
      now - this.totalGroupJobsCacheTimestamp < GROUP_CONFIG.CACHE_TTL_MS
    ) {
      return this.totalGroupJobsCache;
    }

    try {
      // Fetch all group statuses in parallel - getGroupsByStatus returns { id, count }[]
      // This gives us exact counts per status instead of approximations
      const [waitingGroups, limitedGroups, maxedGroups, pausedGroups] = await Promise.all([
        this.queue.getGroupsByStatus(GroupStatus.Waiting),
        this.queue.getGroupsByStatus(GroupStatus.Limited),
        this.queue.getGroupsByStatus(GroupStatus.Maxed),
        this.queue.getGroupsByStatus(GroupStatus.Paused),
      ]);

      // Sum up the exact job counts from each group
      const result = {
        waiting: waitingGroups.reduce((sum, g) => sum + g.count, 0),
        delayed:
          limitedGroups.reduce((sum, g) => sum + g.count, 0) +
          maxedGroups.reduce((sum, g) => sum + g.count, 0),
        paused: pausedGroups.reduce((sum, g) => sum + g.count, 0),
      };

      this.totalGroupJobsCache = result;
      this.totalGroupJobsCacheTimestamp = now;
      return result;
    } catch {
      return { waiting: 0, delayed: 0, paused: 0 };
    }
  }

  public async getRedisInfo(): Promise<string> {
    const client = await this.queue.client;
    return client.info();
  }

  public getName(): string {
    return `${this.prefix}${this.queue.name}`;
  }

  public async clean(jobStatus: JobCleanStatus, graceTimeMs: number): Promise<void> {
    await this.queue.clean(graceTimeMs, Number.MAX_SAFE_INTEGER, jobStatus);
  }

  public addJob(name: string, data: any, options: QueueJobOptions) {
    return this.queue.add(name, data, options);
  }

  public getJob(id: string): Promise<JobPro | undefined> {
    return this.queue.getJob(id);
  }

  public async getJobs(
    jobStatuses: JobStatus[],
    start?: number,
    end?: number
  ): Promise<JobPro[]> {
    const requestedStart = start ?? 0;
    const requestedEnd = end ?? requestedStart + 10;
    const pageSize = requestedEnd - requestedStart;

    // Get regular jobs first
    const regularJobs = await this.queue.getJobs(jobStatuses, start, end);

    // Only check groups for specific statuses
    const statusesToCheckGroups = [STATUSES.waiting, STATUSES.delayed, STATUSES.paused];
    if (!statusesToCheckGroups.some((status) => jobStatuses.includes(status))) {
      return regularJobs;
    }

    // If regular jobs fill the page, no need to check groups
    if (regularJobs.length >= pageSize) {
      return regularJobs;
    }

    // Calculate how many slots we need to fill from groups
    const slotsToFill = pageSize - regularJobs.length;

    try {
      // Map job statuses to group statuses
      const groupStatusesToFetch: GroupStatusType[] = [];
      for (const status of jobStatuses) {
        switch (status) {
          case STATUSES.waiting:
            groupStatusesToFetch.push(GroupStatus.Waiting);
            break;
          case STATUSES.delayed:
            groupStatusesToFetch.push(GroupStatus.Limited, GroupStatus.Maxed);
            break;
          case STATUSES.paused:
            groupStatusesToFetch.push(GroupStatus.Paused);
            break;
        }
      }

      // Calculate offset into group jobs (for pagination)
      const regularCounts = await this.queue.getJobCounts();
      let totalRegularJobs = 0;
      for (const status of jobStatuses) {
        totalRegularJobs += (regularCounts[status] as number) || 0;
      }
      const groupOffset = Math.max(0, requestedStart - totalRegularJobs);

      // OPTIMIZATION: Use getGroupsByStatus which returns { id, count }[]
      // This eliminates N calls to getGroupJobsCount (one per group)
      // Fetch all statuses in parallel
      const groupsByStatusPromises = groupStatusesToFetch.map((status) =>
        this.queue
          .getGroupsByStatus(status)
          .then((groups) => groups.map((g) => ({ id: g.id, count: g.count, status })))
      );
      const groupsArrays = await Promise.all(groupsByStatusPromises);
      const allGroups = groupsArrays.flat();

      // Iterate through groups - count is already available, no extra Redis calls needed
      const groupJobs: JobPro[] = [];
      let currentOffset = 0;

      for (const group of allGroups) {
        // Stop if we have enough jobs
        if (groupJobs.length >= slotsToFill) break;

        const groupJobCount = group.count; // Already have the count from getGroupsByStatus!

        // Skip this group if offset is beyond it
        if (currentOffset + groupJobCount <= groupOffset) {
          currentOffset += groupJobCount;
          continue;
        }

        // Calculate how many jobs to fetch from this group
        const startInGroup = Math.max(0, groupOffset - currentOffset);
        const toFetch = Math.min(groupJobCount - startInGroup, slotsToFill - groupJobs.length);

        if (toFetch > 0) {
          const jobs = await this.getGroupJobs(
            { id: group.id, status: group.status },
            toFetch,
            startInGroup
          );
          groupJobs.push(...jobs);
        }

        currentOffset += groupJobCount;
      }

      return [...regularJobs, ...groupJobs];
    } catch {
      return regularJobs;
    }
  }

  public async getJobCounts(): Promise<JobCounts> {
    const counts = (await this.queue.getJobCounts()) as unknown as JobCounts;

    // Use efficient cached group counts
    const groupCounts = await this.getCachedGroupCounts();

    // Add group counts to regular counts
    counts[STATUSES.waiting] += groupCounts.waiting;
    counts[STATUSES.delayed] += groupCounts.delayed;
    counts[STATUSES.paused] += groupCounts.paused;

    return counts;
  }

  public getJobLogs(id: string): Promise<string[]> {
    return this.queue.getJobLogs(id).then(({ logs }) => logs);
  }

  public isPaused(): Promise<boolean> {
    return this.queue.isPaused();
  }

  public pause(): Promise<void> {
    return this.queue.pause();
  }

  public resume(): Promise<void> {
    return this.queue.resume();
  }

  public empty(): Promise<void> {
    return this.queue.drain();
  }

  public obliterate(): Promise<void> {
    return this.queue.obliterate({ force: false });
  }

  public async promoteAll(): Promise<void> {
    // since bullmq 4.6.0
    if (typeof this.queue.promoteJobs === 'function') {
      await this.queue.promoteJobs();
    } else {
      const jobs = await this.getJobs([STATUSES.delayed]);
      await Promise.all(jobs.map((job) => job.promote()));
    }
  }

  public removeJobScheduler(id: string): Promise<boolean> {
    return this.queue.removeJobScheduler(id);
  }

  public getStatuses(): Status[] {
    return [
      STATUSES.latest,
      STATUSES.active,
      STATUSES.waiting,
      STATUSES.waitingChildren,
      STATUSES.prioritized,
      STATUSES.completed,
      STATUSES.failed,
      STATUSES.delayed,
      STATUSES.paused,
    ];
  }

  public getJobStatuses(): JobStatus[] {
    return [
      STATUSES.active,
      STATUSES.waiting,
      STATUSES.waitingChildren,
      STATUSES.prioritized,
      STATUSES.completed,
      STATUSES.failed,
      STATUSES.delayed,
      STATUSES.paused,
    ];
  }

  /**
   * Get jobs from a specific group
   */
  private async getGroupJobs(
    group: { id: string; status: GroupStatusType },
    limit = 10,
    offset = 0
  ): Promise<JobPro[]> {
    try {
      const jobs = await this.queue.getGroupJobs(group.id, offset, offset + limit);

      // Add group info to each job name for visibility in the UI
      for (const job of jobs) {
        job.name = `${job.name} (group: ${group.id})`;
      }

      return jobs;
    } catch {
      return [];
    }
  }
}

