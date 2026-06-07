import { BullMQProAdapter } from '@bull-board/api/bullMQProAdapter';
import type {
  GroupsCountByStatus,
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

interface MockOverrides {
  jobCounts?: Record<string, number>;
  groupCounts?: GroupsCountByStatus;
  jobsByStatus?: Record<string, JobProLike[]>;
  groupsByStatus?: Partial<Record<GroupStatusName, GroupSummaryWithCount[]>>;
  groupJobs?: Record<string, JobProLike[]>;
}

const makeMockQueue = (
  overrides: MockOverrides = {}
): QueueProLike & { calls: Record<string, number> } => {
  const calls: Record<string, number> = {
    getJobCounts: 0,
    getGroupsCountByStatus: 0,
    getGroupsByStatus: 0,
    getGroupJobs: 0,
  };

  const fake: any = {
    name: 'pro-queue',
    metaValues: { version: 'bullmq-pro-7.0.0' },
    client: Promise.resolve({ info: async () => 'redis_version:7\n' }),
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
    async getGroupsCountByStatus() {
      calls.getGroupsCountByStatus++;
      return overrides.groupCounts ?? { waiting: 0, limited: 0, maxed: 0, paused: 0 };
    },
    async getGroupsByStatus(status: GroupStatusName, _start?: number, _end?: number) {
      calls.getGroupsByStatus++;
      return overrides.groupsByStatus?.[status] ?? [];
    },
    async getGroupJobs(groupId: string | number, _start = 0, _end = -1) {
      calls.getGroupJobs++;
      return overrides.groupJobs?.[String(groupId)] ?? [];
    },
    async getGroups() {
      return [];
    },
    async getGroupsCount() {
      return 0;
    },
    async getGroupJobsCount() {
      return 0;
    },
    calls,
  };

  return fake as QueueProLike & { calls: Record<string, number> };
};

describe('BullMQProAdapter', () => {
  describe('getJobCounts', () => {
    it('merges parent counts with group counts', async () => {
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
        groupCounts: { waiting: 10, limited: 20, maxed: 30, paused: 40 },
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

    it('caches group counts within TTL', async () => {
      const queue = makeMockQueue();
      const adapter = new BullMQProAdapter(queue);

      await adapter.getJobCounts();
      await adapter.getJobCounts();

      expect(queue.calls.getGroupsCountByStatus).toBe(1);
    });

    it('invalidates cache after addJob', async () => {
      const queue = makeMockQueue();
      // Provide an add method on the underlying queue so super.addJob can call through.
      (queue as any).add = async (_name: string, _data: any, _opts: any) => makeFakeJob();
      const adapter = new BullMQProAdapter(queue);

      await adapter.getJobCounts();
      await adapter.addJob('any', {}, {});
      await adapter.getJobCounts();

      expect(queue.calls.getGroupsCountByStatus).toBe(2);
    });

    it('invalidates cache after pause', async () => {
      const queue = makeMockQueue();
      (queue as any).pause = async () => undefined;
      const adapter = new BullMQProAdapter(queue);

      await adapter.getJobCounts();
      await adapter.pause();
      await adapter.getJobCounts();

      expect(queue.calls.getGroupsCountByStatus).toBe(2);
    });
  });

  describe('getJobs', () => {
    it('returns regular jobs only when no group-relevant statuses requested', async () => {
      const queue = makeMockQueue({
        jobsByStatus: { completed: [makeFakeJob({ id: '1' }), makeFakeJob({ id: '2' })] },
      });
      const adapter = new BullMQProAdapter(queue);

      const jobs = await adapter.getJobs(['completed' as any], 0, 9);

      expect(jobs.map((j: any) => j.id)).toEqual(['1', '2']);
      expect(queue.calls.getGroupsByStatus).toBe(0);
    });

    it('falls through to groups when regular jobs do not fill page', async () => {
      const queue = makeMockQueue({
        jobCounts: { waiting: 1 } as any,
        jobsByStatus: { waiting: [makeFakeJob({ id: 'r1' })] },
        groupsByStatus: { waiting: [{ id: 'g1', count: 3 }] },
        groupJobs: { g1: [makeFakeJob({ id: 'g1-a' }), makeFakeJob({ id: 'g1-b' })] },
      });
      const adapter = new BullMQProAdapter(queue);

      const jobs = await adapter.getJobs(['waiting' as any], 0, 2);

      expect(jobs.map((j: any) => j.id)).toEqual(['r1', 'g1-a', 'g1-b']);
    });

    it('skips into groups when start exceeds regular count', async () => {
      const queue = makeMockQueue({
        jobCounts: { waiting: 2 } as any,
        jobsByStatus: { waiting: [] },
        groupsByStatus: { waiting: [{ id: 'g1', count: 5 }] },
        groupJobs: { g1: [makeFakeJob({ id: 'g1-x' }), makeFakeJob({ id: 'g1-y' })] },
      });
      const adapter = new BullMQProAdapter(queue);

      const jobs = await adapter.getJobs(['waiting' as any], 3, 4);

      expect(jobs.map((j: any) => j.id)).toEqual(['g1-x', 'g1-y']);
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
});
