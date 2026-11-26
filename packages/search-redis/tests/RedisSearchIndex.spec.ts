import { Job, Queue } from 'bullmq';
import IORedis from 'ioredis';
import { RedisSearchIndex } from '../src/RedisSearchIndex';
import { connection } from './connection';

const FIELDS = {
  tenant: 'data.tenant',
  name: 'name',
  company: { path: 'data.company', normalize: (value: string) => value.toLowerCase() },
  tags: 'data.tags',
};

describe('RedisSearchIndex', () => {
  let redis: IORedis;
  let queue: Queue;
  let index: RedisSearchIndex;
  let prefix: string;

  beforeAll(async () => {
    redis = new IORedis({ ...connection, maxRetriesPerRequest: null });
  });

  afterAll(async () => {
    await redis.quit();
  });

  beforeEach(async () => {
    const suffix = Math.random().toString(36).slice(2, 10);
    prefix = `search-test-${suffix}`;
    queue = new Queue(`search-queue-${suffix}`, { connection });
    await queue.waitUntilReady();
    index = new RedisSearchIndex({ connection: redis, queue, fields: FIELDS, prefix });
  });

  afterEach(async () => {
    await queue.obliterate({ force: true });
    await queue.close();
    const keys = await redis.keys(`${prefix}:*`);
    if (keys.length > 0) await redis.del(...keys);
  });

  const find = async (field: string, value: string) => {
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const result = await index.page(field, value, cursor, 50);
      ids.push(...result.jobIds);
      cursor = result.cursor;
    } while (cursor);
    return ids;
  };

  it('finds a job by each field and not by another value', async () => {
    const job = await queue.add('send', { tenant: 't1', company: 'Acme', tags: ['a', 'b'] });
    await index.indexJob(job);

    expect(await find('tenant', 't1')).toEqual([job.id]);
    expect(await find('name', 'send')).toEqual([job.id]);
    expect(await find('tags', 'a')).toEqual([job.id]);
    expect(await find('tags', 'b')).toEqual([job.id]);
    expect(await find('tenant', 't2')).toEqual([]);
    expect(await find('name', 'other')).toEqual([]);
  });

  it('normalizes the query value', async () => {
    const job = await queue.add('send', { company: 'acme' });
    await index.indexJob(job);

    expect(await find('company', 'ACME')).toEqual([job.id]);
  });

  it('pages newest first with ties and concurrent inserts', async () => {
    const base = 1_700_000_000_000;
    const originals: string[] = [];
    for (let i = 0; i < 120; i++) {
      const job = await queue.add(
        'j',
        { tenant: 'busy' },
        { jobId: `orig-${String(i).padStart(3, '0')}`, timestamp: base + (i % 5) }
      );
      originals.push(job.id!);
    }
    await index.indexJobs((await Promise.all(originals.map((id) => queue.getJob(id)))) as Job[]);

    const seen: string[] = [];
    const removed = new Set<string>();
    let cursor: string | undefined;
    let step = 0;
    let last: { jobIds: string[]; cursor?: string };
    do {
      last = await index.page('tenant', 'busy', cursor, 7);
      seen.push(...last.jobIds);
      cursor = last.cursor;
      if (cursor) {
        const newer = await queue.add(
          'j',
          { tenant: 'busy' },
          { jobId: `newer-${step}`, timestamp: base + 1000 + step }
        );
        const older = await queue.add(
          'j',
          { tenant: 'busy' },
          { jobId: `older-${step}`, timestamp: base - 1000 - step }
        );
        await index.indexJobs([newer, older]);
        if (step === 2) {
          const cursorJob = last.jobIds[last.jobIds.length - 1];
          await index.removeJob(cursorJob);
          removed.add(cursorJob);
        }
        step++;
      }
    } while (cursor);

    expect(new Set(seen).size).toBe(seen.length);
    for (const id of originals) {
      if (!removed.has(id)) expect(seen).toContain(id);
    }
    expect(last.cursor).toBeUndefined();
  });

  it('returns no cursor when the last page is exactly full', async () => {
    const jobs = await Promise.all(
      [1, 2, 3, 4].map((i) => queue.add('j', { tenant: 'x' }, { timestamp: 1000 + i }))
    );
    await index.indexJobs(jobs);

    const first = await index.page('tenant', 'x', undefined, 2);
    expect(first.jobIds).toHaveLength(2);
    const second = await index.page('tenant', 'x', first.cursor, 2);
    expect(second.jobIds).toHaveLength(2);
    expect(second.cursor).toBeUndefined();
  });

  it('does not repeat earlier pages when the cursor job is re-added with a newer timestamp', async () => {
    const template = await queue.add('send', { tenant: 'v' });
    const jobs = Array.from(
      { length: 9 },
      (_, i) =>
        Object.assign(Object.create(Object.getPrototypeOf(template)), template, {
          id: `j${i}`,
          timestamp: 1000 + i,
        }) as Job
    );
    await index.indexJobs(jobs);

    const first = await index.page('tenant', 'v', undefined, 3);
    const second = await index.page('tenant', 'v', first.cursor, 3);
    const cursorJob = jobs.find((job) => job.id === second.jobIds[2])!;
    await index.removeJob(cursorJob.id!);
    await index.indexJob(Object.assign(cursorJob, { timestamp: 5000 }));
    const third = await index.page('tenant', 'v', second.cursor, 3);

    expect(first.jobIds).toEqual(['j8', 'j7', 'j6']);
    expect(second.jobIds).toEqual(['j5', 'j4', 'j3']);
    expect(third.jobIds).toEqual(['j2', 'j1', 'j0']);
  });

  it.each([
    ['not base64', '@@'],
    ['without a separator', Buffer.from('x').toString('base64url')],
    ['without a job id', Buffer.from('abc:').toString('base64url')],
    ['with a non-numeric score', Buffer.from('abc:j1').toString('base64url')],
  ])('returns an empty page for a cursor %s', async (_label, cursor) => {
    const job = await queue.add('send', { tenant: 'x' });
    await index.indexJob(job);

    await expect(index.page('tenant', 'x', cursor, 5)).resolves.toEqual({ jobIds: [] });
  });

  it('reindex moves a job whose data changed', async () => {
    const job = await queue.add('send', { tenant: 'old' });
    await index.indexJob(job);
    await job.updateData({ tenant: 'new' });
    await index.reindex(job.id!);

    expect(await find('tenant', 'new')).toEqual([job.id]);
    expect(await find('tenant', 'old')).toEqual([]);
    const reverse = await redis.smembers(index.keys.job(job.id!));
    expect(reverse).not.toContain(index.keys.value('tenant', 'old'));
    expect(reverse).toContain(index.keys.value('tenant', 'new'));
  });

  it('reindex removes a job that no longer exists', async () => {
    const job = await queue.add('send', { tenant: 't' });
    await index.indexJob(job);
    await job.remove();
    await index.reindex(job.id!);

    expect(await index.known([job.id!])).toEqual([false]);
    expect(await find('tenant', 't')).toEqual([]);
  });

  it('removeJob deletes every entry of the job', async () => {
    const keep = await queue.add('send', { tenant: 't', tags: ['x'] });
    const drop = await queue.add('send', { tenant: 't', tags: ['x'] });
    await index.indexJobs([keep, drop]);
    await index.removeJob(drop.id!);

    expect(await find('tenant', 't')).toEqual([keep.id]);
    expect(await find('tags', 'x')).toEqual([keep.id]);
    expect(await index.known([keep.id!, drop.id!])).toEqual([true, false]);
    expect(await redis.exists(index.keys.job(drop.id!))).toBe(0);
  });

  it('handles awkward ids and values', async () => {
    const long = 'x'.repeat(2048);
    const unicode = 'zażółć gęślą jaźń 🚀';
    const job = await queue.add('send', { tenant: long, tags: [unicode] }, { jobId: 'a-b{c}' });
    const colon = Object.assign(Object.create(Object.getPrototypeOf(job)), job, {
      id: 'a:b:c',
      timestamp: job.timestamp - 1,
    }) as Job;
    await index.indexJobs([job, colon]);

    expect(await find('tenant', long)).toEqual(['a-b{c}', 'a:b:c']);
    expect(await find('tags', unicode)).toEqual(['a-b{c}', 'a:b:c']);
    const first = await index.page('tenant', long, undefined, 1);
    const second = await index.page('tenant', long, first.cursor, 1);
    expect(second.jobIds).toEqual(['a:b:c']);
    expect(second.cursor).toBeUndefined();
  });

  it('pages a tie group of mixed case and punctuation after the cursor job is removed', async () => {
    const template = await queue.add('send', { tenant: 'mixed' });
    const ids = ['B-1', 'a-1', '_x', 'A_1', 'b-2', 'Z', 'z', '0a', 'a0', 'a-', 'a_', 'B', 'b'];
    const jobs = ids.map(
      (id) =>
        Object.assign(Object.create(Object.getPrototypeOf(template)), template, {
          id,
          timestamp: 5000,
        }) as Job
    );
    await index.indexJobs(jobs);

    for (const pageSize of [1, 2, 3]) {
      await index.indexJobs(jobs);
      const seen: string[] = [];
      const removed = new Set<string>();
      let cursor: string | undefined;
      do {
        const result = await index.page('tenant', 'mixed', cursor, pageSize);
        seen.push(...result.jobIds);
        cursor = result.cursor;
        if (cursor) {
          const cursorJob = result.jobIds[result.jobIds.length - 1];
          await index.removeJob(cursorJob);
          removed.add(cursorJob);
        }
      } while (cursor);

      expect(new Set(seen).size).toBe(seen.length);
      expect([...seen].sort()).toEqual([...ids].sort());
      expect(removed.size).toBeGreaterThan(0);
    }
  });

  it('keeps jobs with no field values in all', async () => {
    const job = await queue.add('send', {});
    const blank = new RedisSearchIndex({
      connection: redis,
      queue,
      fields: { tenant: 'data.tenant' },
      prefix,
    });
    await blank.indexJob(job);

    expect(await blank.known([job.id!, 'missing'])).toEqual([true, false]);
    expect(await redis.smembers(blank.keys.job(job.id!))).toEqual([]);
    expect(await blank.page('tenant', 'undefined', undefined, 10)).toEqual({ jobIds: [] });
  });

  it('survives two indexers writing the same job concurrently', async () => {
    const job = await queue.add('send', { tenant: 'a' });
    await job.updateData({ tenant: 'b' });
    const stale = Object.assign(Object.create(Object.getPrototypeOf(job)), job, {
      data: { tenant: 'a' },
    }) as Job;
    const fresh = Object.assign(Object.create(Object.getPrototypeOf(job)), job, {
      data: { tenant: 'b' },
    }) as Job;

    await Promise.all([index.indexJob(stale), index.indexJob(fresh)]);

    const reverse = await redis.smembers(index.keys.job(job.id!));
    for (const value of ['a', 'b']) {
      const member = await redis.zscore(index.keys.value('tenant', value), job.id!);
      expect(member !== null).toBe(reverse.includes(index.keys.value('tenant', value)));
    }
  });

  it('reindexJobs handles ids across the batch boundary, dropping removed jobs from both batches', async () => {
    const jobs = await queue.addBulk(
      Array.from({ length: 501 }, (_, i) => ({ name: 'send', data: { tenant: `t${i}` } }))
    );
    await index.indexJobs(jobs);
    const gone = [jobs[10], jobs[500]];
    for (const job of gone) await job.remove();
    await jobs[11].updateData({ tenant: 'changed' });

    await index.reindexJobs(jobs.map((job) => job.id as string));

    expect(await index.known(jobs.map((job) => job.id as string))).toEqual(
      jobs.map((job) => !gone.includes(job))
    );
    expect(await find('tenant', 'changed')).toEqual([jobs[11].id]);
    expect(await find('tenant', 't11')).toEqual([]);
    expect(await find('tenant', 't500')).toEqual([]);
    expect(await redis.zcard(index.keys.all)).toBe(499);
  });
});
