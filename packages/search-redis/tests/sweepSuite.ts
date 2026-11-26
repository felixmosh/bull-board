import { Job, Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { RedisSearchIndex } from '../src/RedisSearchIndex';
import { SearchIndexer, SearchIndexerOptions } from '../src/SearchIndexer';
import { sweepOnce } from '../src/sweep';
import { connection } from './connection';
import { sleep, until } from './until';

const FIELDS = { name: 'name', tenant: 'data.tenant' };

export function sweepSuite(): void {
  describe('sweep', () => {
    let redis: IORedis;
    let queue: Queue;
    let index: RedisSearchIndex;
    let prefix: string;
    let queueName: string;
    let closables: { close(): Promise<unknown> }[];
    let indexers: SearchIndexer[];

    beforeAll(async () => {
      redis = new IORedis({ ...connection, maxRetriesPerRequest: null });
    });

    afterAll(async () => {
      await redis.quit();
    });

    beforeEach(async () => {
      const suffix = Math.random().toString(36).slice(2, 10);
      prefix = `sweep-test-${suffix}`;
      queueName = `sweep-queue-${suffix}`;
      queue = new Queue(queueName, { connection });
      await queue.waitUntilReady();
      index = new RedisSearchIndex({ connection: redis, queue, fields: FIELDS, prefix });
      closables = [];
      indexers = [];
    });

    afterEach(async () => {
      jest.restoreAllMocks();
      await Promise.all(indexers.map((indexer) => indexer.stop()));
      await Promise.all(closables.map((closable) => closable.close()));
      await queue.obliterate({ force: true });
      await queue.close();
      const keys = await redis.keys(`${prefix}*`);
      if (keys.length > 0) await redis.del(...keys);
    });

    const makeIndexer = (options: Partial<SearchIndexerOptions> = {}) => {
      const indexer = new SearchIndexer(index, {
        connection,
        backfillOnStart: false,
        sweepEvery: false,
        ...options,
      });
      indexers.push(indexer);
      return indexer;
    };

    const find = async (field: string, value: string) => {
      const ids: string[] = [];
      let cursor: string | undefined;
      do {
        const result = await index.page(field, value, cursor, 100);
        ids.push(...result.jobIds);
        cursor = result.cursor;
      } while (cursor);
      return ids;
    };

    const indexDirectly = async (count: number, timestamp?: number) => {
      const jobs: Job[] = [];
      for (let i = 0; i < count; i += 1000) {
        jobs.push(
          ...(await queue.addBulk(
            Array.from({ length: Math.min(1000, count - i) }, () => ({
              name: 'direct',
              data: { tenant: 'direct' },
              opts: { delay: 60000 },
            }))
          ))
        );
      }
      if (timestamp !== undefined) for (const job of jobs) job.timestamp = timestamp;
      await index.indexJobs(jobs);
      return jobs.map((job) => job.id as string);
    };

    const visits = () => {
      const original = queue.getJob.bind(queue);
      const seen: string[] = [];
      jest.spyOn(queue, 'getJob').mockImplementation((jobId: string) => {
        seen.push(jobId);
        return original(jobId);
      });
      return async () => {
        await sweepOnce(index, 1000);
        return seen.splice(0);
      };
    };

    it('removes ids BullMQ deleted without an event', async () => {
      const indexer = makeIndexer();
      await indexer.start();

      const completed = await queue.addBulk(
        Array.from({ length: 20 }, () => ({
          name: 'auto',
          data: { tenant: 'gone' },
          opts: { removeOnComplete: true },
        }))
      );
      const cleaned = await queue.addBulk(
        Array.from({ length: 10 }, () => ({
          name: 'cleaned',
          data: { tenant: 'gone' },
          opts: { delay: 60000 },
        }))
      );
      const kept = await queue.add('kept', { tenant: 'kept' });
      const dead = [...completed, ...cleaned].map((job) => job.id as string);
      await until(async () => (await index.known([...dead, kept.id as string])).every(Boolean));

      const worker = new Worker(queueName, async () => undefined, { connection });
      closables.push(worker);
      await until(async () => (await queue.getJobCounts('completed')).completed === 1);
      await until(async () =>
        (await Promise.all(completed.map((job) => queue.getJob(job.id as string)))).every(
          (job) => !job
        )
      );
      await queue.clean(0, 1000, 'delayed');
      expect((await index.known(dead)).every(Boolean)).toBe(true);

      const total = await redis.zcard(index.keys.all);
      let checked = 0;
      while (checked < total) checked += (await indexer.sweep()).checked;

      expect(await index.known(dead)).toEqual(dead.map(() => false));
      expect(await find('tenant', 'gone')).toEqual([]);
      expect(await find('name', 'auto')).toEqual([]);
      expect(await find('name', 'cleaned')).toEqual([]);
      expect(await find('tenant', 'kept')).toEqual([kept.id]);
      expect(await redis.hgetall(index.keys.stats)).toMatchObject({
        sweepChecked: expect.any(String),
        sweepRemoved: expect.any(String),
        sweepFinishedAt: expect.any(String),
      });
    });

    it('wraps around and keeps a fixed cost per tick', async () => {
      const ids = await indexDirectly(2500);
      const tick = visits();

      const ticks = [await tick(), await tick(), await tick()];
      for (const visited of ticks) expect(visited.length).toBeLessThanOrEqual(1000);
      const all = ticks.flat();
      expect(all).toHaveLength(2500);
      expect(new Set(all)).toEqual(new Set(ids));

      expect(await tick()).toEqual(ticks[0]);
    });

    it('continues strictly after a stored position whose id is gone', async () => {
      await indexDirectly(2500, 1000);
      const order = await redis.zrange(index.keys.all, 0, '-1');
      const tick = visits();

      expect(await tick()).toEqual(order.slice(0, 1000));
      await index.removeJobs([order[999]]);
      expect(await tick()).toEqual(order.slice(1000, 2000));
      await index.removeJobs([order[1999], order[2000]]);
      expect(await tick()).toEqual(order.slice(2001));
      expect(await tick()).toEqual([...order.slice(0, 999), order[1000]]);
    });

    it('drains the retry set on every sweep', async () => {
      const indexer = makeIndexer();
      const job = await queue.add('retried', { tenant: 'retried' });
      await redis.sadd(index.keys.retry, job.id as string);

      await indexer.sweep();

      expect(await find('tenant', 'retried')).toEqual([job.id]);
      expect(await redis.scard(index.keys.retry)).toBe(0);
    });

    it('sweeps again at once while ticks keep finding dead ids', async () => {
      await indexDirectly(1000);
      await queue.drain(true);
      const indexer = makeIndexer({ sweepEvery: 1000, sweepBatch: 100 });
      await indexer.start();

      await until(async () => (await redis.zcard(index.keys.all)) === 0, 4000);
    });

    it('stops sweeping with stop()', async () => {
      await indexDirectly(10);
      const swept = jest.fn();
      const indexer = makeIndexer({ sweepEvery: 20 });
      indexer.on('swept', swept);
      await indexer.start();
      await until(() => swept.mock.calls.length >= 3);
      expect(swept).toHaveBeenCalledWith({ checked: 10, removed: 0 });

      await indexer.stop();
      const calls = swept.mock.calls.length;
      await sleep(200);
      expect(swept.mock.calls.length).toBe(calls);
    });
  });
}
