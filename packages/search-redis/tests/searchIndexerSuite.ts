import { FlowProducer, Job, Queue, QueueEvents, Worker } from 'bullmq';
import IORedis from 'ioredis';
import * as backfillModule from '../src/backfill';
import { readStatus } from '../src/diagnostics';
import { RedisSearchIndex } from '../src/RedisSearchIndex';
import { IndexerErrorContext, SearchIndexer, SearchIndexerOptions } from '../src/SearchIndexer';
import { compareStreamIds } from '../src/streamId';
import { connection } from './connection';
import { startProxy } from './proxy';
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

    it('reindexes a custom id that was removed on complete and added again', async () => {
      const indexer = makeIndexer(index, { sweepEvery: false });
      await indexer.start();
      const worker = new Worker(queueName, async () => undefined, { connection });
      closables.push(worker);
      await worker.waitUntilReady();

      await queue.add('order', { tenant: 'old' }, { jobId: 'order-1', removeOnComplete: true });
      await until(async () => !(await queue.getJob('order-1')));
      await until(async () => (await find('tenant', 'old')).length === 1);
      await worker.close();

      await queue.add('order', { tenant: 'new' }, { jobId: 'order-1' });

      await until(async () => (await find('tenant', 'new')).length === 1);
      expect(await find('tenant', 'new')).toEqual(['order-1']);
      expect(await find('tenant', 'old')).toEqual([]);
    });

    it('keeps a pending remove when a check for the same id follows it', async () => {
      const indexer = makeIndexer(index, { sweepEvery: false });
      await indexer.start();
      const job = await queue.add('gone', { tenant: 'stale' });
      await until(async () => (await find('tenant', 'stale')).length === 1);
      await redis.del(`${queue.qualifiedName}:${job.id}`);

      const internals = indexer as unknown as {
        generation: number;
        push(generation: number, jobId: string, operation: string, eventId: string): void;
      };
      const now = Date.now() + 60000;
      internals.push(internals.generation, job.id as string, 'remove', `${now}-0`);
      internals.push(internals.generation, job.id as string, 'check', `${now}-1`);

      await until(async () => (await find('tenant', 'stale')).length === 0);
      expect(await index.known([job.id as string])).toEqual([false]);
    });

    it('reports a throwing indexed listener and keeps indexing', async () => {
      const unhandled: unknown[] = [];
      const onUnhandled = (reason: unknown) => unhandled.push(reason);
      process.on('unhandledRejection', onUnhandled);
      const errors: Error[] = [];
      const indexer = makeIndexer(index, { onError: (error) => errors.push(error) });
      indexer.on('indexed', () => {
        throw new Error('listener broke');
      });
      await indexer.start();

      try {
        await queue.add('first', { tenant: 'l1' });
        await until(async () => errors.length > 0);
        const second = await queue.add('second', { tenant: 'l2' });
        await until(async () => (await find('tenant', 'l2')).length === 1);
        expect(await find('tenant', 'l2')).toEqual([second.id]);
        await indexer.stop();
        await sleep(50);
      } finally {
        process.off('unhandledRejection', onUnhandled);
      }

      expect(errors[0].message).toBe('listener broke');
      expect(unhandled).toEqual([]);
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
      const errors: { error: Error; jobIds?: string[] }[] = [];
      const indexer = makeIndexer(index, {
        onError: (error, context) => errors.push({ error, jobIds: context.jobIds }),
      });
      await indexer.start();

      await queue.add('good', { tenant: 'g1' });
      await until(async () => (await find('tenant', 'g1')).length === 1);
      const poison = await queue.add('poison', { tenant: 'bad' });

      await until(async () => (await redis.sismember(index.keys.retry, poison.id as string)) === 1);
      expect(errors.flatMap((entry) => entry.jobIds ?? [])).toContain(poison.id);
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

    it('keeps a batch it cannot park and retries it until the retry set comes back', async () => {
      const errors: { error: Error; context: IndexerErrorContext }[] = [];
      const indexer = makeIndexer(index, {
        maxRetries: 1,
        sweepEvery: false,
        onError: (error, context) => errors.push({ error, context }),
      });
      await indexer.start();
      await queue.add('good', { tenant: 'fine' });
      await until(async () => (await find('tenant', 'fine')).length === 1);
      await until(async () => (await redis.get(index.keys.checkpoint)) !== null);
      const before = (await redis.get(index.keys.checkpoint)) as string;

      const poisoned = poisonIndexJobs();
      const sadd = jest.spyOn(redis, 'sadd').mockRejectedValue(new Error('retry set down'));
      const poison = await queue.add('poison', { tenant: 'bad' });

      await until(() => sadd.mock.calls.length >= 3, 5000);
      const parkFailures = errors.filter((entry) => entry.error.message === 'retry set down');
      expect(parkFailures).toHaveLength(1);
      expect(parkFailures[0].context).toEqual({ jobIds: [poison.id] });
      expect(await redis.get(index.keys.checkpoint)).toEqual(before);
      expect(await redis.exists(index.keys.heartbeat)).toBe(1);

      sadd.mockRestore();
      poisoned.mockRestore();
      await until(async () => (await find('tenant', 'bad')).length === 1, 5000);
      expect(await find('tenant', 'bad')).toEqual([poison.id]);
      await until(
        async () => compareStreamIds((await redis.get(index.keys.checkpoint)) as string, before) > 0
      );
    });

    it('reports a failed batch once with all of its job ids', async () => {
      poisonIndexJobs();
      const errors: { error: Error; context: IndexerErrorContext }[] = [];
      const indexer = makeIndexer(index, {
        maxRetries: 0,
        sweepEvery: false,
        onError: (error, context) => errors.push({ error, context }),
      });
      const jobs = await queue.addBulk(
        Array.from({ length: 3 }, () => ({ name: 'poison', data: { tenant: 'bad' } }))
      );
      await indexer.start();

      await until(async () => (await redis.scard(index.keys.retry)) === 3);
      const failures = errors.filter((entry) => entry.error.message === 'poisoned');
      expect(failures).toHaveLength(1);
      expect([...(failures[0].context.jobIds ?? [])].sort()).toEqual(
        jobs.map((job) => job.id as string).sort()
      );
    });

    it('rejects start after startTimeout when the feed cannot connect, and stops', async () => {
      const indexer = makeIndexer(index, {
        connection: { host: '127.0.0.1', port: 1, db: connection.db },
        startTimeout: 300,
        onError: () => undefined,
      });

      const outcome = await Promise.race([
        indexer.start().then(
          () => 'started',
          (error: Error) => error.message
        ),
        sleep(3000).then(() => 'hung'),
      ]);
      expect(outcome).toContain('300');
      expect((await readStatus(index)).health).not.toBe('ok');
      expect(await redis.exists(index.keys.heartbeat)).toBe(0);
      const stopped = await Promise.race([
        indexer.stop().then(() => 'stopped'),
        sleep(3000).then(() => 'hung'),
      ]);
      expect(stopped).toBe('stopped');
    });

    it('stop() abandons a start that is waiting for the feed', async () => {
      const indexer = makeIndexer(index, {
        connection: { host: '127.0.0.1', port: 1, db: connection.db },
        onError: () => undefined,
      });
      const started = indexer.start().then(
        () => 'resolved',
        (error: Error) => error.message
      );
      await sleep(300);

      const stopped = await Promise.race([
        indexer.stop().then(() => 'stopped'),
        sleep(3000).then(() => 'hung'),
      ]);
      expect(stopped).toBe('stopped');
      expect(await started).toBe('resolved');
      expect((await readStatus(index)).health).not.toBe('ok');
    });

    it('reopens the feed after an event it cannot parse and skips that event', async () => {
      const errors: Error[] = [];
      const indexer = makeIndexer(index, {
        sweepEvery: false,
        onError: (error) => errors.push(error),
      });
      await indexer.start();
      await queue.add('before', { tenant: 'before' });
      await until(async () => (await find('tenant', 'before')).length === 1);
      expect((await readStatus(index)).health).toBe('ok');

      const poisonId = (await redis.xadd(
        queue.keys.events,
        '*',
        'event',
        'progress',
        'jobId',
        'nobody',
        'data',
        'not json'
      )) as string;
      await until(async () => (await readStatus(index)).health !== 'ok', 3000);

      const job = await queue.add('after', { tenant: 'after' });
      await until(async () => (await find('tenant', 'after')).length === 1, 10000);
      expect(await find('tenant', 'after')).toEqual([job.id]);
      await until(async () => (await readStatus(index)).health === 'ok');
      expect(errors.some((error) => error.message.includes(poisonId))).toBe(true);
      await until(
        async () =>
          compareStreamIds((await redis.get(index.keys.checkpoint)) as string, poisonId) > 0
      );
    });

    it('recovers from a 10 s outage of the index Redis and keeps running', async () => {
      const proxy = await startProxy(connection);
      const through = { host: '127.0.0.1', port: proxy.port, db: connection.db };
      const proxied = new IORedis({ ...through, enableOfflineQueue: false });
      const target = new RedisSearchIndex({ connection: proxied, queue, fields: FIELDS, prefix });
      const errors: Error[] = [];
      const indexer = makeIndexer(target, {
        sweepEvery: 1000,
        onError: (error) => errors.push(error),
      });
      proxied.on('error', () => undefined);

      try {
        await new Promise((resolve) => proxied.once('ready', resolve));
        await indexer.start();
        const ids: string[] = [];
        let producing = true;
        const producer = (async () => {
          while (producing) {
            ids.push((await queue.add('outage', { tenant: 'outage' })).id as string);
            await sleep(20);
          }
        })();

        await sleep(500);
        proxy.pause();
        await sleep(10000);
        proxy.resume();
        await sleep(500);
        producing = false;
        await producer;

        await until(() => allKnown(ids), 30000);
        await until(async () => (await readStatus(index)).health === 'ok', 10000);
        expect(await allKnown(ids)).toBe(true);
        expect(errors.length).toBeGreaterThan(0);
      } finally {
        await indexer.stop();
        proxied.disconnect();
        await proxy.close();
      }
    }, 70000);

    it('keeps a retried job that comes back while the retry set drains', async () => {
      const indexer = makeIndexer(index, { sweepEvery: false });
      await indexer.start();
      await redis.sadd(index.keys.retry, 'order-1');
      const original = index.removeJobs.bind(index);
      jest.spyOn(index, 'removeJobs').mockImplementationOnce(async (jobIds: string[]) => {
        const seen = new Promise((resolve) => indexer.once('indexed', resolve));
        await queue.add('back', { tenant: 'back' }, { jobId: 'order-1' });
        await seen;
        return original(jobIds);
      });

      await indexer.sweep();
      expect(await index.known(['order-1'])).toEqual([true]);
      expect(await redis.scard(index.keys.retry)).toBe(0);
    });

    it('clears a stale backfill flag at start and keeps it set while any backfill runs', async () => {
      await redis.hset(index.keys.stats, 'backfillRunning', '1');
      const indexer = makeIndexer(index, { sweepEvery: false });
      await indexer.start();
      expect(await redis.hget(index.keys.stats, 'backfillRunning')).toBe('0');

      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      jest
        .spyOn(backfillModule, 'backfillQueue')
        .mockImplementationOnce(async () => {
          await gate;
          return { jobs: 0, durationMs: 0 };
        })
        .mockResolvedValueOnce({ jobs: 0, durationMs: 0 });

      const slow = indexer.backfill();
      await indexer.backfill();
      expect(await redis.hget(index.keys.stats, 'backfillRunning')).toBe('1');
      release();
      await slow;
      expect(await redis.hget(index.keys.stats, 'backfillRunning')).toBe('0');
    });

    it('deletes the heartbeat later when stop cannot', async () => {
      const indexer = makeIndexer(index, { sweepEvery: false, onError: () => undefined });
      await indexer.start();
      jest.spyOn(redis, 'del').mockRejectedValueOnce(new Error('del down'));

      await indexer.stop();
      expect(await redis.exists(index.keys.heartbeat)).toBe(1);
      await until(async () => (await redis.exists(index.keys.heartbeat)) === 0, 3000);
    });

    it('starts and follows the feed while a retried job keeps failing', async () => {
      poisonIndexJobs();
      const errors: { error: Error; jobIds?: string[] }[] = [];
      const indexer = makeIndexer(index, {
        maxRetries: 0,
        onError: (error, context) => errors.push({ error, jobIds: context.jobIds }),
      });
      await indexer.start();
      const poison = await queue.add('poison', { tenant: 'bad' });
      await until(async () => (await redis.sismember(index.keys.retry, poison.id as string)) === 1);
      await indexer.stop();
      errors.length = 0;

      const restarted = makeIndexer(index, {
        onError: (error, context) => errors.push({ error, jobIds: context.jobIds }),
      });
      await restarted.start();
      expect(errors.flatMap((entry) => entry.jobIds ?? [])).toContain(poison.id);

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
