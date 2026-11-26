import { FlowProducer, Job, Queue, QueueEvents, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { RedisSearchIndex } from '../src/RedisSearchIndex';
import { SearchIndexer, SearchIndexerOptions } from '../src/SearchIndexer';
import { compareStreamIds } from '../src/streamId';
import { connection } from './connection';
import { sleep, until } from './until';

const FIELDS = { name: 'name', tenant: 'data.tenant' };

export function searchIndexerSuite(): void {
  describe('SearchIndexer', () => {
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
      prefix = `indexer-test-${suffix}`;
      queueName = `indexer-queue-${suffix}`;
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

    const makeIndexer = (target = index, options: Partial<SearchIndexerOptions> = {}) => {
      const indexer = new SearchIndexer(target, { connection, backfillOnStart: false, ...options });
      indexers.push(indexer);
      return indexer;
    };

    const find = async (field: string, value: string, target = index) => {
      const ids: string[] = [];
      let cursor: string | undefined;
      do {
        const result = await target.page(field, value, cursor, 100);
        ids.push(...result.jobIds);
        cursor = result.cursor;
      } while (cursor);
      return ids;
    };

    const allKnown = async (ids: string[]) => (await index.known(ids)).every(Boolean);

    it('indexes jobs from a producer it does not know', async () => {
      const indexer = makeIndexer();
      await indexer.start();

      const producer = new Queue(queueName, { connection });
      closables.push(producer);
      await producer.waitUntilReady();
      const jobs = await producer.addBulk(
        Array.from({ length: 20 }, (_, i) => ({ name: 'send', data: { tenant: `t${i % 2}` } }))
      );

      const t0 = jobs.filter((_, i) => i % 2 === 0).map((job) => job.id as string);
      await until(async () => (await find('tenant', 't0')).length === t0.length);
      expect((await find('tenant', 't0')).sort()).toEqual([...t0].sort());
      expect(await find('name', 'send')).toHaveLength(20);
    });

    it('indexes a job added right after start resolves', async () => {
      const indexer = makeIndexer();
      await indexer.start();
      const job = await queue.add('first', { tenant: 'early' });

      await until(async () => (await find('tenant', 'early')).length === 1, 2000);
      expect(await find('tenant', 'early')).toEqual([job.id]);
    });

    it('indexes flow children, scheduler iterations and delayed jobs', async () => {
      const indexer = makeIndexer();
      await indexer.start();

      const flows = new FlowProducer({ connection });
      closables.push(flows);
      await flows.waitUntilReady();
      const flow = await flows.add({
        name: 'parent',
        queueName,
        data: { tenant: 'flow' },
        children: [
          { name: 'child', queueName, data: { tenant: 'flow' } },
          { name: 'child', queueName, data: { tenant: 'flow' } },
        ],
      });
      const flowIds = [flow.job.id, ...(flow.children ?? []).map((child) => child.job.id)];

      const delayed = await queue.add('later', { tenant: 'delayed' }, { delay: 60000 });

      const worker = new Worker(queueName, async () => undefined, { connection });
      closables.push(worker);
      await worker.waitUntilReady();
      await queue.upsertJobScheduler('every', { every: 100 }, { name: 'tick', data: {} });

      await until(async () => (await find('tenant', 'flow')).length === 3);
      expect((await find('tenant', 'flow')).sort()).toEqual([...flowIds].sort());
      await until(async () => (await find('tenant', 'delayed')).length === 1);
      expect(await find('tenant', 'delayed')).toEqual([delayed.id]);
      await until(async () => (await find('name', 'tick')).length >= 3);
      await queue.removeJobScheduler('every');
    });

    it('removes on job.remove()', async () => {
      const indexer = makeIndexer();
      await indexer.start();
      const keep = await queue.add('keep', { tenant: 'r' });
      const drop = await queue.add('drop', { tenant: 'r' });
      await until(async () => (await find('tenant', 'r')).length === 2);

      const removed: string[] = [];
      indexer.on('removed', (ids: string[]) => removed.push(...ids));
      await drop.remove();

      await until(async () => (await find('tenant', 'r')).length === 1);
      expect(await find('tenant', 'r')).toEqual([keep.id]);
      expect(await find('name', 'drop')).toEqual([]);
      expect(removed).toContain(drop.id);
    });

    it('resumes from the checkpoint', async () => {
      const indexer = makeIndexer();
      await indexer.start();
      await queue.add('first', { tenant: 'before' });
      await until(async () => (await find('tenant', 'before')).length === 1);
      await until(async () => (await redis.get(index.keys.checkpoint)) !== null);
      await indexer.stop();
      const before = (await redis.get(index.keys.checkpoint)) as string;

      const jobs = await queue.addBulk(
        Array.from({ length: 30 }, () => ({ name: 'later', data: { tenant: 'resumed' } }))
      );

      const resumed = makeIndexer();
      await resumed.start();
      await until(async () => (await find('tenant', 'resumed')).length === 30);
      expect((await find('tenant', 'resumed')).sort()).toEqual(
        jobs.map((job) => job.id as string).sort()
      );
      const after = (await redis.get(index.keys.checkpoint)) as string;
      expect(compareStreamIds(after, before)).toBeGreaterThan(0);
    });

    it('never moves the checkpoint backwards and loses nothing across stop and start mid-burst', async () => {
      const ids: string[] = [];
      let producing = true;
      const producer = (async () => {
        while (producing) {
          const job = await queue.add('burst', { tenant: 'burst' });
          ids.push(job.id as string);
        }
      })();

      const checkpoints: string[] = [];
      let sampling = true;
      const sampler = (async () => {
        while (sampling) {
          const checkpoint = await redis.get(index.keys.checkpoint);
          if (checkpoint) checkpoints.push(checkpoint);
          await sleep(5);
        }
      })();

      for (let round = 0; round < 5; round++) {
        const indexer = makeIndexer();
        await indexer.start();
        const target = ids.length + 20;
        await until(() => ids.length >= target);
        await indexer.stop();
      }

      producing = false;
      await producer;

      const final = makeIndexer();
      await final.start();
      await until(() => allKnown(ids), 20000);
      sampling = false;
      await sampler;

      expect(await allKnown(ids)).toBe(true);
      expect(checkpoints.length).toBeGreaterThan(0);
      for (let i = 1; i < checkpoints.length; i++) {
        expect(compareStreamIds(checkpoints[i], checkpoints[i - 1])).toBeGreaterThanOrEqual(0);
      }
    });

    it('two indexers produce the same index as one', async () => {
      const single = new RedisSearchIndex({
        connection: redis,
        queue,
        fields: FIELDS,
        prefix: `${prefix}-single`,
      });
      const twin = new RedisSearchIndex({ connection: redis, queue, fields: FIELDS, prefix });
      await Promise.all([makeIndexer(index).start(), makeIndexer(twin).start()]);
      await makeIndexer(single).start();

      const jobs = await queue.addBulk(
        Array.from({ length: 50 }, (_, i) => ({ name: 'pair', data: { tenant: `p${i % 3}` } }))
      );
      await Promise.all(jobs.slice(0, 5).map((job) => job.remove()));
      const survivors = jobs.slice(5).map((job) => job.id as string);

      const settled = async (target: RedisSearchIndex) => {
        const members = await redis.zrange(target.keys.all, 0, '-1');
        return members.length === survivors.length && survivors.every((id) => members.includes(id));
      };
      await until(() => settled(index));
      await until(() => settled(single));

      expect(await redis.zrange(index.keys.all, 0, '-1', 'WITHSCORES')).toEqual(
        await redis.zrange(single.keys.all, 0, '-1', 'WITHSCORES')
      );
      expect(await redis.zrange(index.keys.value('tenant', 'p1'), 0, '-1', 'WITHSCORES')).toEqual(
        await redis.zrange(single.keys.value('tenant', 'p1'), 0, '-1', 'WITHSCORES')
      );
    });

    it('keeps a failing job for later', async () => {
      const original = index.indexJobs.bind(index);
      const spy = jest.spyOn(index, 'indexJobs').mockImplementation(async (jobs: Job[]) => {
        if (jobs.some((job) => job.name === 'poison')) throw new Error('poisoned');
        return original(jobs);
      });
      const errors: { error: Error; jobId?: string }[] = [];
      const indexer = makeIndexer(index, {
        onError: (error, context) => errors.push({ error, jobId: context.jobId }),
      });
      await indexer.start();

      await queue.add('good', { tenant: 'g1' });
      await until(async () => (await find('tenant', 'g1')).length === 1);
      const poison = await queue.add('poison', { tenant: 'bad' });

      await until(async () => (await redis.sismember(index.keys.retry, poison.id as string)) === 1);
      expect(errors.map((entry) => entry.jobId)).toContain(poison.id);
      const afterPoison = (await redis.get(index.keys.checkpoint)) as string;
      const poisonEvent = await redis.xrange(queue.keys.events, '-', '+');
      const addedId = poisonEvent.find(
        ([, fields]) => fields.includes('added') && fields.includes(poison.id as string)
      )?.[0] as string;
      expect(compareStreamIds(afterPoison, addedId)).toBeGreaterThanOrEqual(0);

      const good = await queue.add('good', { tenant: 'g2' });
      await until(async () => (await find('tenant', 'g2')).length === 1);
      expect(await find('tenant', 'g2')).toEqual([good.id]);
      expect(await find('tenant', 'bad')).toEqual([]);

      await indexer.stop();
      spy.mockRestore();

      const restarted = makeIndexer();
      await restarted.start();
      await until(async () => (await find('tenant', 'bad')).length === 1);
      expect(await find('tenant', 'bad')).toEqual([poison.id]);
      expect(await redis.scard(index.keys.retry)).toBe(0);
    });

    it('handles one burst in stream order', async () => {
      const indexer = makeIndexer();
      await indexer.start();
      await queue.add('seed', { tenant: 'seed' });
      await until(async () => (await find('tenant', 'seed')).length === 1);
      await until(async () => (await redis.get(index.keys.checkpoint)) !== null);
      await indexer.stop();
      const before = (await redis.get(index.keys.checkpoint)) as string;

      const gone = await queue.add('gone', { tenant: 'burst' });
      await gone.remove();
      const back = await queue.add('back', { tenant: 'burst' }, { jobId: 'same-id' });
      await back.remove();
      await queue.add('back', { tenant: 'burst' }, { jobId: 'same-id' });

      const writes = jest.spyOn(index, 'indexJobs');
      const resumed = makeIndexer();
      await resumed.start();
      await until(
        async () => compareStreamIds((await redis.get(index.keys.checkpoint)) as string, before) > 0
      );
      expect(await find('tenant', 'burst')).toEqual(['same-id']);
      expect(await find('name', 'gone')).toEqual([]);
      expect(writes).toHaveBeenCalledTimes(1);
    });
    const poisonIndexJobs = () => {
      const original = index.indexJobs.bind(index);
      return jest.spyOn(index, 'indexJobs').mockImplementation(async (jobs: Job[]) => {
        if (jobs.some((job) => job.name === 'poison')) throw new Error('poisoned');
        return original(jobs);
      });
    };

    it('cleans up after a failed start and can start again', async () => {
      jest.spyOn(redis, 'hset').mockRejectedValueOnce(new Error('hset down'));
      const indexer = makeIndexer();
      await expect(indexer.start()).rejects.toThrow('hset down');
      expect(await redis.exists(index.keys.heartbeat)).toBe(0);

      await indexer.start();
      expect(await redis.exists(index.keys.heartbeat)).toBe(1);
      const job = await queue.add('after', { tenant: 'restarted' });
      await until(async () => (await find('tenant', 'restarted')).length === 1);
      expect(await find('tenant', 'restarted')).toEqual([job.id]);
    });

    it('opens one feed for concurrent starts', async () => {
      const indexer = makeIndexer();
      const indexed: string[] = [];
      indexer.on('indexed', (ids: string[]) => indexed.push(...ids));
      const opened = jest.spyOn(QueueEvents.prototype, 'waitUntilReady');
      await Promise.all([indexer.start(), indexer.start()]);
      expect(opened).toHaveBeenCalledTimes(1);

      const jobs: Job[] = [];
      for (let i = 0; i < 5; i++) {
        const job = await queue.add('once', { tenant: 'once' });
        jobs.push(job);
        await until(() => indexed.includes(job.id as string));
      }
      for (const job of jobs) {
        expect(indexed.filter((id) => id === job.id)).toHaveLength(1);
      }
    });

    it('stops without moving the checkpoint when the retry set cannot be written', async () => {
      const errors: { error: Error; jobId?: string }[] = [];
      const indexer = makeIndexer(index, {
        maxRetries: 1,
        onError: (error, context) => errors.push({ error, jobId: context.jobId }),
      });
      await indexer.start();
      await queue.add('good', { tenant: 'fine' });
      await until(async () => (await find('tenant', 'fine')).length === 1);
      await until(async () => (await redis.get(index.keys.checkpoint)) !== null);
      const before = await redis.get(index.keys.checkpoint);

      poisonIndexJobs();
      jest.spyOn(redis, 'sadd').mockRejectedValue(new Error('retry set down'));
      await queue.add('poison', { tenant: 'bad' });

      await until(() => errors.some((entry) => entry.error.message === 'retry set down'));
      await until(async () => (await redis.exists(index.keys.heartbeat)) === 0);
      expect(await redis.get(index.keys.checkpoint)).toEqual(before);
      expect(indexer.listenerCount('error')).toBe(0);
    });

    it('starts and follows the feed while a retried job keeps failing', async () => {
      poisonIndexJobs();
      const errors: { error: Error; jobId?: string }[] = [];
      const indexer = makeIndexer(index, {
        maxRetries: 0,
        onError: (error, context) => errors.push({ error, jobId: context.jobId }),
      });
      await indexer.start();
      const poison = await queue.add('poison', { tenant: 'bad' });
      await until(async () => (await redis.sismember(index.keys.retry, poison.id as string)) === 1);
      await indexer.stop();
      errors.length = 0;

      const restarted = makeIndexer(index, {
        onError: (error, context) => errors.push({ error, jobId: context.jobId }),
      });
      await restarted.start();
      expect(errors.map((entry) => entry.jobId)).toContain(poison.id);

      const good = await queue.add('good', { tenant: 'after-poison' });
      await until(async () => (await find('tenant', 'after-poison')).length === 1);
      expect(await find('tenant', 'after-poison')).toEqual([good.id]);
      expect(await redis.sismember(index.keys.retry, poison.id as string)).toBe(1);
    });
    it('ends running when start follows stop on a running indexer', async () => {
      const indexer = makeIndexer();
      await indexer.start();
      void indexer.stop();
      await indexer.start();

      const job = await queue.add('after-stop', { tenant: 'stop-start' });
      await until(async () => (await find('tenant', 'stop-start')).length === 1);
      expect(await find('tenant', 'stop-start')).toEqual([job.id]);
      expect(await redis.exists(index.keys.heartbeat)).toBe(1);
    });

    it('ends running when start, stop and start overlap', async () => {
      const indexer = makeIndexer();
      const first = indexer.start();
      const stopped = indexer.stop();
      await indexer.start();
      await Promise.all([first, stopped]);

      const job = await queue.add('overlap', { tenant: 'overlap' });
      await until(async () => (await find('tenant', 'overlap')).length === 1);
      expect(await find('tenant', 'overlap')).toEqual([job.id]);
      expect(await redis.exists(index.keys.heartbeat)).toBe(1);
    });
  });
}
