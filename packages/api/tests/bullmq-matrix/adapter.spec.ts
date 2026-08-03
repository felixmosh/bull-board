import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { Queue } from 'bullmq';
import { STATUSES } from '../../src/constants/statuses';
import {
  assertResolvedMajor,
  connection,
  destroyQueue,
  EXPECTED_MAJOR,
  isV6,
  makeQueue,
  uniqueName,
} from './helpers';

describe(`BullMQAdapter on bullmq@${EXPECTED_MAJOR}`, () => {
  assertResolvedMajor();

  let queue: Queue;
  let adapter: BullMQAdapter;

  beforeEach(async () => {
    queue = await makeQueue('matrix');
    adapter = new BullMQAdapter(queue);
  });

  afterEach(async () => {
    await destroyQueue(queue);
  });

  describe('redis client resolution', () => {
    it('returns parseable INFO output', async () => {
      const info = await adapter.getRedisInfo();

      expect(typeof info).toBe('string');
      expect(info).toContain('redis_version:');
    });

    it('hands out a usable raw client', async () => {
      const client = await adapter.getClient();

      expect(client).not.toBeNull();
      // `ping` is not on BullMQ's narrowed client interface, but it is the cheapest proof the
      // connection is live rather than merely non-null.
      await expect((client as any).ping()).resolves.toBe('PONG');
    });

    it('resolves the same client instance on repeated calls', async () => {
      const [first, second] = await Promise.all([adapter.getClient(), adapter.getClient()]);

      expect(first).toBe(second);
    });
  });

  describe('paused state', () => {
    it(`${isV6() ? 'omits' : 'advertises'} the paused status`, () => {
      const expected = isV6() ? false : true;

      expect(adapter.getStatuses().includes(STATUSES.paused)).toBe(expected);
      expect(adapter.getJobStatuses().includes(STATUSES.paused)).toBe(expected);
    });

    it('keeps getStatuses as latest plus the job statuses', () => {
      expect(adapter.getStatuses()).toEqual([STATUSES.latest, ...adapter.getJobStatuses()]);
    });

    it('reports a count for every status it advertises', async () => {
      await queue.pause();
      await queue.add('job', { hello: 'world' });

      const counts = await adapter.getJobCounts();

      for (const status of adapter.getJobStatuses()) {
        expect(counts[status]).toEqual(expect.any(Number));
      }
    });

    it('files a paused queue’s job under the status it advertises', async () => {
      await queue.pause();
      await queue.add('job', { hello: 'world' });

      // v6 removed the paused state: a paused queue's jobs are stored as waiting.
      const bucket = isV6() ? STATUSES.waiting : STATUSES.paused;
      const jobs = await adapter.getJobs([bucket], 0, 10);
      const counts = await adapter.getJobCounts();

      expect(jobs).toHaveLength(1);
      expect(counts[bucket]).toBe(1);
      expect(await adapter.isPaused()).toBe(true);
    });
  });

  describe('queue surface', () => {
    it('adds and reads back a job', async () => {
      const added = await adapter.addJob('greet', { hello: 'world' }, {});
      const fetched = await adapter.getJob(added.id!);

      expect(fetched?.data).toEqual({ hello: 'world' });
    });

    it('counts, lists and cleans jobs', async () => {
      await adapter.addJob('a', { n: 1 }, {});
      await adapter.addJob('b', { n: 2 }, {});

      expect((await adapter.getJobCounts())[STATUSES.waiting]).toBe(2);
      expect(await adapter.getJobs([STATUSES.waiting], 0, 10)).toHaveLength(2);

      await adapter.empty();

      expect((await adapter.getJobCounts())[STATUSES.waiting]).toBe(0);
    });

    it('pauses and resumes', async () => {
      await adapter.pause();
      expect(await adapter.isPaused()).toBe(true);

      await adapter.resume();
      expect(await adapter.isPaused()).toBe(false);
    });

    it('promotes delayed jobs', async () => {
      await adapter.addJob('later', { n: 1 }, { delay: 60_000 });
      expect((await adapter.getJobCounts())[STATUSES.delayed]).toBe(1);

      await adapter.promoteAll();

      expect((await adapter.getJobCounts())[STATUSES.delayed]).toBe(0);
      expect((await adapter.getJobCounts())[STATUSES.waiting]).toBe(1);
    });

    it('reads and writes global concurrency', async () => {
      expect(await adapter.getGlobalConcurrency()).toBeNull();

      await adapter.setGlobalConcurrency(4);
      expect(await adapter.getGlobalConcurrency()).toBe(4);

      await adapter.setGlobalConcurrency(0);
      expect(await adapter.getGlobalConcurrency()).toBeNull();
    });

    it('reads job logs', async () => {
      const job = await adapter.addJob('logged', {}, {});
      await job.log('first line');

      expect(await adapter.getJobLogs(job.id!)).toEqual(['first line']);
    });

    it('reports metrics', async () => {
      const metrics = await adapter.getMetrics('completed', 0, 10);

      expect(metrics.count).toEqual(expect.any(Number));
      expect(Array.isArray(metrics.data)).toBe(true);
    });

    it('lists workers', async () => {
      expect(await adapter.getWorkers()).toEqual([]);
    });

    it('exposes the fully prefixed queue key', () => {
      expect(adapter.getQueueKey('completed')).toBe(`bull:${queue.name}:completed`);
    });

    it('returns the configured default job options', async () => {
      const withDefaults = new Queue(uniqueName('defaults'), {
        connection,
        defaultJobOptions: { attempts: 3 },
      });

      try {
        expect(new BullMQAdapter(withDefaults).getQueueDefaultJobOptions()).toEqual({
          attempts: 3,
        });
      } finally {
        await destroyQueue(withDefaults);
      }
    });

    it('manages job schedulers', async () => {
      const id = 'every-minute';
      await queue.upsertJobScheduler(id, { every: 60_000 }, { name: 'tick' });

      const schedulers = await adapter.getJobSchedulers();
      expect(schedulers.map((s) => s.id)).toContain(id);
      expect(await adapter.getJobSchedulersCount()).toBe(1);

      expect(await adapter.removeJobScheduler(id)).toBe(true);
      expect(await adapter.getJobSchedulersCount()).toBe(0);
    });

    it('rejects a queue that is not a BullMQ queue', () => {
      expect(() => new BullMQAdapter({ name: 'nope' } as any)).toThrow(/non-BullMQ queue/);
    });
  });
});
