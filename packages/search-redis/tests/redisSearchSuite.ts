import type { JobSearchProvider } from '@bull-board/api/typings/app';
import { Job, Queue } from 'bullmq';
import IORedis from 'ioredis';
import { RedisSearch, RedisSearchIndexerOptions } from '../src/RedisSearch';
import { connection } from './connection';
import { until } from './until';

export function redisSearchSuite(): void {
  describe('RedisSearch', () => {
    let redis: IORedis;
    let prefix: string;
    let suffix: string;
    let queues: Queue[];
    let searches: RedisSearch[];

    beforeAll(async () => {
      redis = new IORedis({ ...connection, maxRetriesPerRequest: null });
    });

    afterAll(async () => {
      await redis.quit();
    });

    beforeEach(() => {
      suffix = Math.random().toString(36).slice(2, 10);
      prefix = `redis-search-test-${suffix}`;
      queues = [];
      searches = [];
    });

    afterEach(async () => {
      jest.restoreAllMocks();
      await Promise.all(searches.map((search) => search.stop()));
      for (const queue of queues) {
        await queue.obliterate({ force: true });
        await queue.close();
      }
      const keys = await redis.keys(`${prefix}*`);
      if (keys.length > 0) await redis.del(...keys);
    });

    const makeQueue = async (name: string) => {
      const queue = new Queue(`${name}-${suffix}`, { connection });
      await queue.waitUntilReady();
      queues.push(queue);
      return queue;
    };

    const makeSearch = (
      fields: Record<string, string> = { tenant: 'data.tenantId' },
      indexer: Partial<RedisSearchIndexerOptions> = {}
    ) => {
      const search = new RedisSearch({
        connection: redis,
        indexer: { connection, backfillOnStart: false, sweepEvery: false, ...indexer },
        fields,
        prefix,
      });
      searches.push(search);
      return search;
    };

    const find = async (provider: JobSearchProvider, field: string, value: string) =>
      (await provider.search({ field, value, limit: 100 })).jobIds.sort();

    const ids = (jobs: Job[]) => jobs.map((job) => job.id as string).sort();

    it('searches several queues with shared and per-queue fields', async () => {
      const orders = await makeQueue('orders');
      const emails = await makeQueue('emails');
      const search = makeSearch();
      const ordersProvider = search.add(orders);
      const emailsProvider = search.add(emails, { fields: { to: 'data.to' } });

      const order = await orders.add('order', { tenantId: 'acme' });
      const email = await emails.add('email', { tenantId: 'acme', to: 'a@example.com' });
      await search.index(orders).indexJobs([order]);
      await search.index(emails).indexJobs([email]);

      expect(await ordersProvider.fields()).toEqual(['tenant']);
      expect(await emailsProvider.fields()).toEqual(['tenant', 'to']);
      expect(await find(ordersProvider, 'tenant', 'acme')).toEqual([order.id]);
      expect(await find(emailsProvider, 'tenant', 'acme')).toEqual([email.id]);
      expect(await find(emailsProvider, 'to', 'a@example.com')).toEqual([email.id]);
      expect(await find(ordersProvider, 'to', 'a@example.com')).toEqual([]);
    });

    it('lets a queue field override a shared one', async () => {
      const orders = await makeQueue('orders');
      const search = makeSearch();
      const provider = search.add(orders, { fields: { tenant: 'data.org' } });

      const job = await orders.add('order', { tenantId: 'shared', org: 'own' });
      await search.index(orders).indexJobs([job]);

      expect(await provider.fields()).toEqual(['tenant']);
      expect(await find(provider, 'tenant', 'own')).toEqual([job.id]);
      expect(await find(provider, 'tenant', 'shared')).toEqual([]);
    });

    it('throws when a queue is added twice', async () => {
      const orders = await makeQueue('orders');
      const search = makeSearch();
      search.add(orders);

      expect(() => search.add(orders)).toThrow(orders.qualifiedName);
    });

    it('answers without start()', async () => {
      const orders = await makeQueue('orders');
      const search = makeSearch();
      const provider = search.add(orders);

      const job = await orders.add('order', { tenantId: 'acme' });
      await search.index(orders).indexJobs([job]);

      expect(await find(provider, 'tenant', 'acme')).toEqual([job.id]);
      const status = await provider.diagnostics!.status();
      expect(status.indexedJobs).toBe(1);
      expect(status.indexerLastSeenAt).toBeUndefined();
    });

    it('start and stop cover every queue', async () => {
      const orders = await makeQueue('orders');
      const emails = await makeQueue('emails');
      const search = makeSearch();
      const ordersProvider = search.add(orders);
      const emailsProvider = search.add(emails);

      await search.start();
      const order = await orders.add('order', { tenantId: 'live' });
      const email = await emails.add('email', { tenantId: 'live' });

      await until(async () => (await find(ordersProvider, 'tenant', 'live')).length === 1);
      await until(async () => (await find(emailsProvider, 'tenant', 'live')).length === 1);
      expect(await find(ordersProvider, 'tenant', 'live')).toEqual([order.id]);
      expect(await find(emailsProvider, 'tenant', 'live')).toEqual([email.id]);
      expect(await redis.exists(search.index(orders).keys.heartbeat)).toBe(1);
      expect(await redis.exists(search.index(emails).keys.heartbeat)).toBe(1);

      await search.stop();
      expect(await redis.exists(search.index(orders).keys.heartbeat)).toBe(0);
      expect(await redis.exists(search.index(emails).keys.heartbeat)).toBe(0);
    });

    it('reindex picks up updateData and drops removed jobs', async () => {
      const orders = await makeQueue('orders');
      const search = makeSearch();
      const provider = search.add(orders);

      const jobs = await orders.addBulk(
        ['a', 'b', 'c'].map((name) => ({ name, data: { tenantId: 'old' } }))
      );
      await search.index(orders).indexJobs(jobs);
      await jobs[0].updateData({ tenantId: 'new' });
      await jobs[1].updateData({ tenantId: 'new' });
      await jobs[2].remove();

      await search.reindex(
        orders,
        jobs.map((job) => job.id as string)
      );

      expect(await find(provider, 'tenant', 'new')).toEqual(ids(jobs.slice(0, 2)));
      expect(await find(provider, 'tenant', 'old')).toEqual([]);
      expect(await search.index(orders).known([jobs[2].id as string])).toEqual([false]);
    });

    it('backfill(queue) and backfill() reindex', async () => {
      const orders = await makeQueue('orders');
      const emails = await makeQueue('emails');
      const search = makeSearch();
      const ordersProvider = search.add(orders);
      const emailsProvider = search.add(emails);

      const order = await orders.add('order', { tenantId: 'old' });
      const email = await emails.add('email', { tenantId: 'old' });
      await search.index(orders).indexJobs([order]);
      await search.index(emails).indexJobs([email]);
      await order.updateData({ tenantId: 'new' });
      await email.updateData({ tenantId: 'new' });

      await search.backfill(orders);
      expect(await find(ordersProvider, 'tenant', 'new')).toEqual([order.id]);
      expect(await find(emailsProvider, 'tenant', 'new')).toEqual([]);

      await search.backfill();
      expect(await find(emailsProvider, 'tenant', 'new')).toEqual([email.id]);
      expect(await find(emailsProvider, 'tenant', 'old')).toEqual([]);
    });

    it('names the queue in indexer errors', async () => {
      const orders = await makeQueue('orders');
      const emails = await makeQueue('emails');
      const onError = jest.fn();
      const search = makeSearch(undefined, { maxRetries: 0, onError });
      search.add(orders);
      search.add(emails);
      jest.spyOn(search.index(emails), 'indexJobs').mockRejectedValue(new Error('write failed'));

      await search.start();
      const email = await emails.add('email', { tenantId: 'acme' });

      await until(() => onError.mock.calls.length > 0);
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'write failed' }), {
        queue: emails.qualifiedName,
        jobId: email.id,
      });
    });

    it('exposes each queue indexer', async () => {
      const orders = await makeQueue('orders');
      const search = makeSearch();
      search.add(orders);
      const indexed = jest.fn();
      search.indexer(orders).on('indexed', indexed);

      await search.start();
      const job = await orders.add('order', { tenantId: 'acme' });

      await until(() => indexed.mock.calls.some(([jobIds]) => jobIds.includes(job.id)));
    });

    it('starts a queue added after start()', async () => {
      const orders = await makeQueue('orders');
      const late = await makeQueue('late');
      const search = makeSearch();
      search.add(orders);
      await search.start();

      const provider = search.add(late);
      const job = await late.add('late', { tenantId: 'late' });

      await until(async () => (await find(provider, 'tenant', 'late')).length === 1);
      expect(await find(provider, 'tenant', 'late')).toEqual([job.id]);
    });

    it('stops the started indexers when one fails to start', async () => {
      const orders = await makeQueue('orders');
      const emails = await makeQueue('emails');
      const search = makeSearch();
      search.add(orders);
      search.add(emails);
      const ordersStart = jest.spyOn(search.indexer(orders), 'start');
      jest.spyOn(search.indexer(emails), 'start').mockRejectedValue(new Error('start failed'));

      await expect(search.start()).rejects.toThrow('start failed');
      await ordersStart.mock.results[0].value;
      expect(await redis.exists(search.index(orders).keys.heartbeat)).toBe(0);
    });

    it('throws for a queue that was not added', async () => {
      const orders = await makeQueue('orders');
      const search = makeSearch();

      await expect(search.reindex(orders, ['1'])).rejects.toThrow(orders.qualifiedName);
      await expect(search.backfill(orders)).rejects.toThrow(orders.qualifiedName);
      expect(() => search.index(orders)).toThrow(orders.qualifiedName);
      expect(() => search.indexer(orders)).toThrow(orders.qualifiedName);
    });
  });
}
