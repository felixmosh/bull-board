import { BullMQProAdapter } from '@bull-board/api/bullMQProAdapter';
import type {
  GroupStatusName,
  GroupSummaryWithCount,
  JobProLike,
  QueueProLike,
} from '@bull-board/api/bullMQProAdapter';
import { formatJob } from '@bull-board/api/dist/handlers/queues';

const makeJobProps = (overrides: Partial<any> = {}) => ({
  id: '1',
  name: 'send-email',
  progress: 0,
  attemptsMade: 0,
  finishedOn: null,
  processedOn: null,
  delay: 0,
  timestamp: 0,
  failedReason: '',
  stacktrace: null,
  data: {},
  returnvalue: null,
  opts: {},
  ...overrides,
});

const makeFakeJob = (props: Partial<any> = {}): JobProLike => {
  const merged = makeJobProps(props);
  return {
    toJSON: () => merged,
    ...merged,
  } as unknown as JobProLike;
};

/** `count` jobs whose ids are `<prefix>0`, `<prefix>1`, ... */
const makeFakeJobs = (prefix: string, count: number): JobProLike[] =>
  Array.from({ length: count }, (_, index) => makeFakeJob({ id: `${prefix}${index}` }));

const jobIds = (jobs: { id?: string }[]) => jobs.map((job) => job.id);

interface MockOverrides {
  jobCounts?: Record<string, number>;
  jobsByStatus?: Record<string, JobProLike[]>;
  groupsByStatus?: Partial<Record<GroupStatusName, GroupSummaryWithCount[]>>;
  groupJobs?: Record<string, JobProLike[]>;
}

/** A group as bullmq-pro < 7.46.3 returns it: an id, with no job count. */
const groupWithoutCount = (id: string): GroupSummaryWithCount => ({ id });

/** A group whose count came back out of Redis as a string rather than a number. */
const groupWithStringCount = (id: string, count: number): GroupSummaryWithCount =>
  ({ id, count: String(count) }) as unknown as GroupSummaryWithCount;

type MockQueue = QueueProLike & {
  calls: Record<string, number>;
  /** `getGroupsByStatus()` calls per group status. */
  groupListings: Record<string, number>;
  /** Every `(status, start, end)` `getGroupsByStatus()` was asked for. */
  groupRanges: [GroupStatusName, number | undefined, number | undefined][];
  /** How many `getGroupJobs()` calls were ever in flight at the same time. */
  maxConcurrentGroupJobs: number;
};

/**
 * How many times the adapter has read the groups. A single read asks `getGroupsByStatus()`
 * once per group status, so counting the most-read status says how many reads happened without
 * hard-coding how many group statuses there are.
 */
const groupReads = (queue: MockQueue): number => Math.max(0, ...Object.values(queue.groupListings));

const makeMockQueue = (overrides: MockOverrides = {}): MockQueue => {
  const calls: Record<string, number> = {
    getJobCounts: 0,
    getGroupsCountByStatus: 0,
    getGroupsByStatus: 0,
    getGroupJobs: 0,
    getGroupJobsCount: 0,
  };

  let inFlightGroupJobs = 0;

  const fake: any = {
    name: 'pro-queue',
    metaValues: { version: 'bullmq-pro-7.0.0' },
    client: Promise.resolve({ info: async () => 'redis_version:7\n' }),
    calls,
    groupListings: {} as Record<string, number>,
    groupRanges: [] as [GroupStatusName, number | undefined, number | undefined][],
    maxConcurrentGroupJobs: 0,
    async getJobCounts() {
      calls.getJobCounts++;
      return (
        overrides.jobCounts ?? {
          active: 0,
          waiting: 0,
          delayed: 0,
          paused: 0,
          completed: 0,
          failed: 0,
          prioritized: 0,
          'waiting-children': 0,
        }
      );
    },
    async getJobs(statuses: string[], _start = 0, _end = -1) {
      const out: JobProLike[] = [];
      for (const s of statuses) {
        if (overrides.jobsByStatus?.[s]) out.push(...overrides.jobsByStatus[s]);
      }
      return out;
    },
    // The adapter must never fall back to counting groups instead of the jobs in them (#1346),
    // so this stays on the double purely as a trap.
    async getGroupsCountByStatus() {
      calls.getGroupsCountByStatus++;
      return { waiting: 0, limited: 0, maxed: 0, paused: 0 };
    },
    async getGroupsByStatus(status: GroupStatusName, start?: number, end?: number) {
      calls.getGroupsByStatus++;
      fake.groupListings[status] = (fake.groupListings[status] ?? 0) + 1;
      fake.groupRanges.push([status, start, end]);
      return overrides.groupsByStatus?.[status] ?? [];
    },
    async getGroupJobs(groupId: string | number, start = 0, end = -1) {
      calls.getGroupJobs++;
      inFlightGroupJobs++;
      fake.maxConcurrentGroupJobs = Math.max(fake.maxConcurrentGroupJobs, inFlightGroupJobs);
      // Yield, so calls issued together overlap and calls awaited one by one do not.
      await Promise.resolve();
      inFlightGroupJobs--;

      const jobs = overrides.groupJobs?.[String(groupId)] ?? [];
      return jobs.slice(start, end === -1 ? undefined : end + 1);
    },
    async getGroupJobsCount(groupId: string | number) {
      calls.getGroupJobsCount++;
      return overrides.groupJobs?.[String(groupId)]?.length ?? 0;
    },
  };

  return fake as MockQueue;
};

describe('BullMQProAdapter', () => {
  describe('getJobCounts', () => {
    it('merges parent counts with the jobs held by groups', async () => {
      const queue = makeMockQueue({
        jobCounts: {
          active: 1,
          waiting: 2,
          delayed: 3,
          paused: 4,
          completed: 5,
          failed: 6,
          prioritized: 0,
          'waiting-children': 0,
        },
        groupsByStatus: {
          waiting: [
            { id: 'w1', count: 4 },
            { id: 'w2', count: 6 },
          ],
          limited: [{ id: 'l1', count: 20 }],
          maxed: [
            { id: 'm1', count: 12 },
            { id: 'm2', count: 18 },
          ],
          paused: [{ id: 'p1', count: 40 }],
        },
      });
      const adapter = new BullMQProAdapter(queue);

      const counts = await adapter.getJobCounts();

      expect(counts.waiting).toBe(2 + 10);
      expect(counts.delayed).toBe(3 + 20 + 30);
      expect(counts.paused).toBe(4 + 40);
      expect(counts.active).toBe(1);
      expect(counts.completed).toBe(5);
      expect(counts.failed).toBe(6);
    });

    // Issue #1346: group counts used to be folded in as-is, so 45 jobs spread over 3 groups
    // were reported as 3 waiting.
    it('counts the jobs inside groups, not the groups themselves', async () => {
      const queue = makeMockQueue({
        groupsByStatus: {
          waiting: [
            { id: 'a', count: 15 },
            { id: 'b', count: 15 },
            { id: 'c', count: 15 },
          ],
        },
      });
      const adapter = new BullMQProAdapter(queue);

      const counts = await adapter.getJobCounts();

      expect(counts.waiting).toBe(45);
      expect(queue.calls.getGroupsCountByStatus).toBe(0);
    });

    // The totals are only right if every group is listed, so the range is never left to the
    // getter's default.
    it('asks for the whole range of groups', async () => {
      const queue = makeMockQueue();
      const adapter = new BullMQProAdapter(queue);

      await adapter.getJobCounts();

      expect(queue.groupRanges).toEqual([
        ['waiting', 0, -1],
        ['limited', 0, -1],
        ['maxed', 0, -1],
        ['paused', 0, -1],
      ]);
    });

    // ioredis surfaces numbers coming out of a Lua script as strings often enough that a count
    // of "15" must not degrade to the no-count fallback.
    it('reads a count that arrives as a string', async () => {
      const queue = makeMockQueue({
        groupsByStatus: {
          waiting: [groupWithStringCount('a', 15), groupWithStringCount('b', 30)],
        },
      });
      const adapter = new BullMQProAdapter(queue);

      const counts = await adapter.getJobCounts();

      expect(counts.waiting).toBe(45);
      expect(queue.calls.getGroupJobsCount).toBe(0);
    });

    // bullmq-pro < 7.46.3 does not return a count alongside the group id.
    it('asks the queue to count the groups that arrive without a count', async () => {
      const queue = makeMockQueue({
        groupsByStatus: { waiting: [groupWithoutCount('a'), groupWithoutCount('b')] },
        groupJobs: { a: makeFakeJobs('a', 15), b: makeFakeJobs('b', 30) },
      });
      const adapter = new BullMQProAdapter(queue);

      const counts = await adapter.getJobCounts();

      expect(counts.waiting).toBe(45);
      expect(queue.calls.getGroupJobsCount).toBe(2);
    });

    it('counts a group as one job when the queue cannot count it either', async () => {
      const queue = makeMockQueue({
        groupsByStatus: {
          waiting: [groupWithoutCount('a'), groupWithoutCount('b'), groupWithoutCount('c')],
        },
      });
      delete (queue as any).getGroupJobsCount;
      const adapter = new BullMQProAdapter(queue);

      const counts = await adapter.getJobCounts();

      expect(counts.waiting).toBe(3);
    });

    it('reads the queue once within the TTL', async () => {
      const queue = makeMockQueue();
      const adapter = new BullMQProAdapter(queue);

      await adapter.getJobCounts();
      await adapter.getJobCounts();

      expect(groupReads(queue)).toBe(1);
      expect(queue.calls.getJobCounts).toBe(1);
    });

    it('shares one reading between callers arriving together', async () => {
      const queue = makeMockQueue();
      const adapter = new BullMQProAdapter(queue);

      await Promise.all([adapter.getJobCounts(), adapter.getJobCounts()]);

      expect(groupReads(queue)).toBe(1);
      expect(queue.calls.getJobCounts).toBe(1);
    });

    it('does not serve a failed reading for the rest of the TTL', async () => {
      const queue = makeMockQueue();
      let failNext = true;
      const groups = queue.getGroupsByStatus.bind(queue);
      (queue as any).getGroupsByStatus = async (...args: any[]) => {
        if (failNext) {
          failNext = false;
          throw new Error('redis is down');
        }
        return (groups as any)(...args);
      };
      const adapter = new BullMQProAdapter(queue);

      await expect(adapter.getJobCounts()).rejects.toThrow('redis is down');

      await expect(adapter.getJobCounts()).resolves.toEqual(
        expect.objectContaining({ waiting: 0 })
      );
    });

    it('invalidates the reading after addJob', async () => {
      const queue = makeMockQueue();
      // Provide an add method on the underlying queue so super.addJob can call through.
      (queue as any).add = async (_name: string, _data: any, _opts: any) => makeFakeJob();
      const adapter = new BullMQProAdapter(queue);

      await adapter.getJobCounts();
      await adapter.addJob('any', {}, {});
      await adapter.getJobCounts();

      expect(groupReads(queue)).toBe(2);
    });

    it('invalidates the reading after pause', async () => {
      const queue = makeMockQueue();
      (queue as any).pause = async () => undefined;
      const adapter = new BullMQProAdapter(queue);

      await adapter.getJobCounts();
      await adapter.pause();
      await adapter.getJobCounts();

      expect(groupReads(queue)).toBe(2);
    });

    // Clearing only before the write would let a poll landing mid-write cache the queue as it
    // was and serve that for a whole TTL.
    it('drops a reading taken while a mutation was still in flight', async () => {
      const queue = makeMockQueue();
      let finishAdd: () => void = () => undefined;
      (queue as any).add = () =>
        new Promise((resolve) => {
          finishAdd = () => resolve(makeFakeJob());
        });
      const adapter = new BullMQProAdapter(queue);

      const added = adapter.addJob('any', {}, {});
      await adapter.getJobCounts();
      finishAdd();
      await added;
      await adapter.getJobCounts();

      expect(groupReads(queue)).toBe(2);
    });
  });

  describe('getJobs', () => {
    it('returns regular jobs only when no group-relevant statuses requested', async () => {
      const queue = makeMockQueue({
        jobsByStatus: { completed: [makeFakeJob({ id: '1' }), makeFakeJob({ id: '2' })] },
      });
      const adapter = new BullMQProAdapter(queue);

      const jobs = await adapter.getJobs(['completed' as any], 0, 9);

      expect(jobIds(jobs as any)).toEqual(['1', '2']);
      expect(groupReads(queue)).toBe(0);
      expect(queue.calls.getJobCounts).toBe(0);
    });

    it('falls through to groups when regular jobs do not fill page', async () => {
      const queue = makeMockQueue({
        jobCounts: { waiting: 1 },
        jobsByStatus: { waiting: [makeFakeJob({ id: 'r1' })] },
        groupsByStatus: { waiting: [{ id: 'g1', count: 2 }] },
        groupJobs: { g1: makeFakeJobs('g1-', 2) },
      });
      const adapter = new BullMQProAdapter(queue);

      const jobs = await adapter.getJobs(['waiting' as any], 0, 2);

      expect(jobIds(jobs as any)).toEqual(['r1', 'g1-0', 'g1-1']);
    });

    it('skips into groups when start exceeds regular count', async () => {
      const queue = makeMockQueue({
        jobCounts: { waiting: 2 },
        jobsByStatus: { waiting: [] },
        groupsByStatus: { waiting: [{ id: 'g1', count: 5 }] },
        groupJobs: { g1: makeFakeJobs('g1-', 5) },
      });
      const adapter = new BullMQProAdapter(queue);

      const jobs = await adapter.getJobs(['waiting' as any], 3, 4);

      expect(jobIds(jobs as any)).toEqual(['g1-1', 'g1-2']);
    });

    it('pages across group boundaries', async () => {
      const queue = makeMockQueue({
        jobCounts: { waiting: 0 },
        groupsByStatus: {
          waiting: [
            { id: 'a', count: 2 },
            { id: 'b', count: 2 },
          ],
        },
        groupJobs: { a: makeFakeJobs('a', 2), b: makeFakeJobs('b', 2) },
      });
      const adapter = new BullMQProAdapter(queue);

      const jobs = await adapter.getJobs(['waiting' as any], 1, 2);

      expect(jobIds(jobs as any)).toEqual(['a1', 'b0']);
    });

    // Without a real per-group count, pagination would read `[0, 0]` from every group and hide
    // every job in it but the first.
    it('lists every job of a group the pro version reported no count for', async () => {
      const queue = makeMockQueue({
        jobCounts: { waiting: 0 },
        groupsByStatus: { waiting: [groupWithoutCount('a'), groupWithoutCount('b')] },
        groupJobs: { a: makeFakeJobs('a', 3), b: makeFakeJobs('b', 3) },
      });
      const adapter = new BullMQProAdapter(queue);

      const firstPage = await adapter.getJobs(['waiting' as any], 0, 3);
      const secondPage = await adapter.getJobs(['waiting' as any], 4, 5);

      expect(jobIds(firstPage as any)).toEqual(['a0', 'a1', 'a2', 'b0']);
      expect(jobIds(secondPage as any)).toEqual(['b1', 'b2']);
    });

    it('reads the groups of a page at once rather than one by one', async () => {
      const queue = makeMockQueue({
        jobCounts: { waiting: 0 },
        groupsByStatus: {
          waiting: [
            { id: 'a', count: 1 },
            { id: 'b', count: 1 },
            { id: 'c', count: 1 },
          ],
        },
        groupJobs: { a: makeFakeJobs('a', 1), b: makeFakeJobs('b', 1), c: makeFakeJobs('c', 1) },
      });
      const adapter = new BullMQProAdapter(queue);

      const jobs = await adapter.getJobs(['waiting' as any], 0, 2);

      expect(jobIds(jobs as any)).toEqual(['a0', 'b0', 'c0']);
      expect(queue.maxConcurrentGroupJobs).toBe(3);
    });

    it('serves a listing from the same reading the counts were taken from', async () => {
      const queue = makeMockQueue({
        jobCounts: { waiting: 1 },
        jobsByStatus: { waiting: [makeFakeJob({ id: 'r1' })] },
        groupsByStatus: { waiting: [{ id: 'g1', count: 2 }] },
        groupJobs: { g1: makeFakeJobs('g1-', 2) },
      });
      const adapter = new BullMQProAdapter(queue);

      const counts = await adapter.getJobCounts();
      const jobs = await adapter.getJobs(['waiting' as any], 0, 9);

      expect(counts.waiting).toBe(3);
      expect(jobIds(jobs as any)).toEqual(['r1', 'g1-0', 'g1-1']);
      // Counts and listing came out of one reading: neither half was fetched twice.
      expect(groupReads(queue)).toBe(1);
      expect(queue.calls.getJobCounts).toBe(1);
    });
  });

  describe('default name formatter', () => {
    it('appends group id suffix when present', async () => {
      const queue = makeMockQueue();
      const adapter = new BullMQProAdapter(queue);
      const job = makeFakeJob({ name: 'send-email', opts: { group: { id: 'tenant-42' } } });

      const formatted = formatJob(job as any, adapter);

      expect(formatted.name).toBe('send-email (group: tenant-42)');
    });

    it('leaves name untouched when no group id', async () => {
      const queue = makeMockQueue();
      const adapter = new BullMQProAdapter(queue);
      const job = makeFakeJob({ name: 'send-email', opts: {} });

      const formatted = formatJob(job as any, adapter);

      expect(formatted.name).toBe('send-email');
    });

    it('can be overridden by user-supplied formatter', async () => {
      const queue = makeMockQueue();
      const adapter = new BullMQProAdapter(queue);
      adapter.setFormatter('name', (jobProps: any) => jobProps.name);
      const job = makeFakeJob({ name: 'send-email', opts: { group: { id: 'tenant-42' } } });

      const formatted = formatJob(job as any, adapter);

      expect(formatted.name).toBe('send-email');
    });
  });

  describe('formatJob groupId surfacing', () => {
    it('populates groupId from opts.group.id', async () => {
      const queue = makeMockQueue();
      const adapter = new BullMQProAdapter(queue);
      const job = makeFakeJob({ opts: { group: { id: 'tenant-42' } } });

      const formatted = formatJob(job as any, adapter);

      expect(formatted.groupId).toBe('tenant-42');
    });

    it('leaves groupId undefined when no group', async () => {
      const queue = makeMockQueue();
      const adapter = new BullMQProAdapter(queue);
      const job = makeFakeJob({ opts: {} });

      const formatted = formatJob(job as any, adapter);

      expect(formatted.groupId).toBeUndefined();
    });
  });

  describe('isPro marker', () => {
    it('exposes isPro = true', () => {
      const queue = makeMockQueue();
      const adapter = new BullMQProAdapter(queue);

      expect(adapter.isPro).toBe(true);
      expect(adapter.type).toBe('bullmq');
    });
  });

  // Pro is built on BullMQ v5, which still has the paused state, and `getJobCounts` above
  // aggregates a paused group count. Dropping the status would leave that count unreachable.
  describe('paused status', () => {
    it('still advertises paused, and resolves its redis client', async () => {
      const adapter = new BullMQProAdapter(makeMockQueue());

      expect(adapter.getStatuses()).toContain('paused');
      expect(adapter.getJobStatuses()).toContain('paused');
      await expect(adapter.getRedisInfo()).resolves.toContain('redis_version');
    });
  });
});
