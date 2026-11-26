import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { backfillQueue } from '../src/backfill';
import { RedisSearchIndex } from '../src/RedisSearchIndex';
import { SearchIndexer, SearchIndexerOptions } from '../src/SearchIndexer';
import { connection } from './connection';
import { sleep, until } from './until';

const FIELDS = { name: 'name', tenant: 'data.tenant' };

const RETRY_ONCE = { attempts: 2, backoff: { type: 'fixed', delay: 150 } };

export function backfillSuite(): void {
  describe('backfill', () => {
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
      prefix = `backfill-test-${suffix}`;
      queueName = `backfill-queue-${suffix}`;
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

    const allKnown = async (ids: string[]) => (await index.known(ids)).every(Boolean);

    const addMany = async (count: number, name: string, tenant: string) => {
      const ids: string[] = [];
      for (let i = 0; i < count; i += 1000) {
        const jobs = await queue.addBulk(
          Array.from({ length: Math.min(1000, count - i) }, () => ({ name, data: { tenant } }))
        );
        ids.push(...jobs.map((job) => job.id as string));
      }
      return ids;
    };

    const preload = async (count: number) => {
      const ids: string[] = [];
      for (let i = 0; i < count; i += 1000) {
        const bulk = Array.from({ length: Math.min(1000, count - i) }, (_, k) => {
          const n = i + k;
          const kind = n % 10;
          const opts =
            kind < 2
              ? { delay: Math.floor(Math.random() * 3000) }
              : kind < 4
                ? { priority: 1 + (n % 10) }
                : {};
          return { name: 'pre', data: { n, tenant: 'pre' }, opts: { ...RETRY_ONCE, ...opts } };
        });
        ids.push(...(await queue.addBulk(bulk)).map((job) => job.id as string));
      }
      return ids;
    };

    const churn = async () => {
      const workers = [0, 1].map(
        () =>
          new Worker(
            queueName,
            async (job) => {
              await sleep(Math.random() * 3);
              if (job.data.n % 3 === 0 && job.attemptsMade === 0) throw new Error('retry me');
            },
            { connection, concurrency: 50 }
          )
      );
      closables.push(...workers);
      await Promise.all(workers.map((worker) => worker.waitUntilReady()));
      let producing = true;
      let late = 0;
      const producer = (async () => {
        while (producing) {
          await queue.add('late', { n: -++late, tenant: 'late' }, RETRY_ONCE);
        }
      })();
      await sleep(50);
      return async () => {
        producing = false;
        await producer;
        await Promise.all(workers.map((worker) => worker.close()));
      };
    };

    const stillExisting = async (ids: string[]) => {
      const jobs = await Promise.all(ids.map((id) => queue.getJob(id)));
      return ids.filter((_, i) => jobs[i]);
    };

    it('indexes jobs that existed before install', async () => {
      const ids = await addMany(2000, 'before', 'installed');
      const indexer = makeIndexer({ backfillOnStart: true });
      const backfilled = new Promise((resolve) => indexer.once('backfilled', resolve));
      await indexer.start();

      expect(await backfilled).toEqual({ jobs: 2000, durationMs: expect.any(Number) });
      expect(await allKnown(ids)).toBe(true);
      const stats = await redis.hgetall(index.keys.stats);
      expect(stats).toMatchObject({ backfillRunning: '0', backfillJobs: '2000' });
      expect(Number(stats.backfillFinishedAt)).toBeGreaterThan(0);
      expect(Number(stats.backfillDurationMs)).toBeGreaterThanOrEqual(0);
    });

    it('misses nothing under churn', async () => {
      const ids = await preload(5000);
      const stopChurn = await churn();

      const indexer = makeIndexer({ backfillOnStart: true });
      const backfilled = new Promise((resolve) => indexer.once('backfilled', resolve));
      await indexer.start();
      await backfilled;
      await stopChurn();

      let missing: string[] = [];
      await until(async () => {
        const existing = await stillExisting(ids);
        const known = await index.known(existing);
        missing = existing.filter((_, i) => !known[i]);
        return missing.length === 0;
      }, 15000).catch(() => undefined);
      expect(missing).toEqual([]);
    });

    it('standalone backfill alone misses jobs under churn', async () => {
      const ids = await preload(5000);
      const stopChurn = await churn();

      await backfillQueue(index, 500);
      await stopChurn();

      const existing = await stillExisting(ids);
      const known = await index.known(existing);
      expect(known.filter((isKnown) => !isKnown).length).toBeGreaterThanOrEqual(1);
    });

    it('reindexes data changed through updateData', async () => {
      const indexer = makeIndexer();
      await indexer.start();
      const job = await queue.add('change', { tenant: 'old' });
      await until(async () => (await find('tenant', 'old')).length === 1);

      await job.updateData({ tenant: 'new' });
      expect(await find('tenant', 'new')).toEqual([]);
      await indexer.backfill();

      expect(await find('tenant', 'new')).toEqual([job.id]);
      expect(await find('tenant', 'old')).toEqual([]);
    });

    it('fills a gap after the stream was trimmed', async () => {
      await queue.close();
      queue = new Queue(queueName, { connection, streams: { events: { maxLen: 50 } } });
      await queue.waitUntilReady();
      index = new RedisSearchIndex({ connection: redis, queue, fields: FIELDS, prefix });

      const first = makeIndexer();
      await first.start();
      await queue.add('seed', { tenant: 'seed' });
      await until(async () => (await find('tenant', 'seed')).length === 1);
      await until(async () => (await redis.get(index.keys.checkpoint)) !== null);
      await first.stop();

      const ids = await addMany(1000, 'gap', 'gap');
      expect(await redis.xlen(queue.keys.events)).toBeLessThan(1000);

      const second = makeIndexer({ backfillOnStart: true });
      await second.start();
      await until(() => allKnown(ids));
      expect((await find('tenant', 'gap')).sort()).toEqual([...ids].sort());
    });

    it('stops a start-time backfill with stop()', async () => {
      await addMany(2000, 'slow', 'slow');
      const original = queue.getJobs.bind(queue);
      const pages = jest.spyOn(queue, 'getJobs').mockImplementation(async (...args) => {
        await sleep(5);
        return original(...args);
      });
      const backfilled = jest.fn();
      const indexer = makeIndexer({ backfillOnStart: true, backfillBatchSize: 20 });
      indexer.on('backfilled', backfilled);
      await indexer.start();
      await until(async () => (await redis.hget(index.keys.stats, 'backfillRunning')) === '1');
      await until(() => pages.mock.calls.length >= 3);

      await indexer.stop();
      const calls = pages.mock.calls.length;
      expect(await redis.hget(index.keys.stats, 'backfillRunning')).toBe('0');
      await sleep(100);
      expect(pages.mock.calls.length).toBe(calls);
      expect(backfilled).not.toHaveBeenCalled();
      expect(await redis.hget(index.keys.stats, 'backfillFinishedAt')).toBeNull();
    });

    it('reports a failed backfill and keeps following the feed', async () => {
      jest.spyOn(queue, 'getJobs').mockRejectedValueOnce(new Error('getJobs down'));
      const reported: Error[] = [];
      const emitted: Error[] = [];
      const indexer = makeIndexer({
        backfillOnStart: true,
        onError: (error) => reported.push(error),
      });
      indexer.on('error', (error: Error) => emitted.push(error));
      await indexer.start();

      await until(() => emitted.some((error) => error.message === 'getJobs down'));
      expect(reported.map((error) => error.message)).toContain('getJobs down');
      await until(async () => (await redis.hget(index.keys.stats, 'backfillRunning')) === '0');

      const job = await queue.add('after', { tenant: 'after-failure' });
      await until(async () => (await find('tenant', 'after-failure')).length === 1);
      expect(await find('tenant', 'after-failure')).toEqual([job.id]);
    });
  });
}
