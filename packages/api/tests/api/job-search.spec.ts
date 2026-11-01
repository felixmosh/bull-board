import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { buildMatcher } from '@bull-board/api/dist/handlers/jobSearch';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import request from 'supertest';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: +(process.env.REDIS_PORT || 6379),
};

const QUEUE_NAME = 'JobSearchQueue';

describe('job search', () => {
  let queue: Queue;
  let serverAdapter: ExpressAdapter;

  const search = (query: Record<string, string>) =>
    request(serverAdapter.getRouter())
      .get('/api/queues')
      .query({ activeQueue: QUEUE_NAME, status: 'waiting', ...query });

  const ids = (res: request.Response) =>
    JSON.parse(res.text)
      .queues.find((q: any) => q.name === QUEUE_NAME)
      .jobs.map((job: any) => job.id)
      .sort();

  beforeAll(async () => {
    queue = new Queue(QUEUE_NAME, { connection });
    await queue.obliterate({ force: true });
    await queue.add('send-email', { user: { email: 'Ana@example.com' } }, { jobId: 'order-1' });
    await queue.add('send-email', { user: { email: 'bob@example.com' } }, { jobId: 'order-2' });
    await queue.add('send-sms', { phone: '+5511999990000' }, { jobId: 'order-30' });
    serverAdapter = new ExpressAdapter();
    createBullBoard({ queues: [new BullMQAdapter(queue)], serverAdapter });
  });

  afterAll(async () => {
    await queue.obliterate({ force: true }).catch(() => undefined);
    await queue.close();
  });

  it('matches across every field by default, case-insensitively', async () => {
    const res = await search({ search: 'ana@EXAMPLE' }).expect(200);
    expect(ids(res)).toEqual(['order-1']);
    expect(JSON.parse(res.text).queues[0].search).toEqual({
      scanned: 3,
      matched: 1,
      scanLimit: 1000,
      truncated: false,
    });
  });

  it('honours case sensitivity', async () => {
    const res = await search({ search: 'ana@', caseSensitive: 'true' }).expect(200);
    expect(ids(res)).toEqual([]);
  });

  it('finds a job by exact id without scanning', async () => {
    const res = await search({ search: 'order-2', searchIn: 'id', match: 'exact' }).expect(200);
    expect(ids(res)).toEqual(['order-2']);
    expect(JSON.parse(res.text).queues[0].search.scanned).toBe(1);
  });

  it('does not return an exact id match from another status', async () => {
    const res = await search({
      search: 'order-2',
      searchIn: 'id',
      match: 'exact',
      status: 'completed',
    }).expect(200);
    expect(ids(res)).toEqual([]);
  });

  it('matches ids with a Redis-style glob', async () => {
    const res = await search({ search: 'order-?', searchIn: 'id', match: 'glob' }).expect(200);
    expect(ids(res)).toEqual(['order-1', 'order-2']);
  });

  it('filters by name with exact match', async () => {
    const res = await search({ search: 'send-sms', searchIn: 'name', match: 'exact' }).expect(200);
    expect(ids(res)).toEqual(['order-30']);
  });

  it('matches data keys by path and data values by leaf', async () => {
    const byKey = await search({ search: 'user.email', searchIn: 'dataKey', match: 'exact' });
    expect(ids(byKey)).toEqual(['order-1', 'order-2']);

    const byValue = await search({ search: '^\\+55', searchIn: 'dataValue', match: 'regex' });
    expect(ids(byValue)).toEqual(['order-30']);
  });

  it('paginates the matches, not the whole status list', async () => {
    const res = await search({ search: 'order', searchIn: 'id', jobsPerPage: '2', page: '2' });
    const body = JSON.parse(res.text).queues[0];
    expect(body.pagination.pageCount).toBe(2);
    expect(body.jobs).toHaveLength(1);
  });

  it('stops at the scan limit and reports it', async () => {
    const res = await search({ search: 'order', scanLimit: '2' }).expect(200);
    expect(JSON.parse(res.text).queues[0].search).toMatchObject({
      scanned: 2,
      truncated: true,
    });
  });

  it('answers 400 with a translation key for a regex that does not compile', async () => {
    const res = await search({ search: '([', match: 'regex' }).expect(400);
    expect(JSON.parse(res.text).error).toEqual({ key: 'ERRORS.INVALID_SEARCH_PATTERN' });
  });

  it('rejects an unknown search field', async () => {
    await search({ search: 'x', searchIn: 'nope' }).expect(400);
  });

  it('leaves the response untouched without a search', async () => {
    const res = await search({}).expect(200);
    expect(ids(res)).toHaveLength(3);
    expect(JSON.parse(res.text).queues[0].search).toBeUndefined();
  });
});

describe('buildMatcher', () => {
  it.each([
    ['user:*:email', 'user:42:email', true],
    ['user:*:email', 'user:42:phone', false],
    ['order-[0-9]', 'order-7', true],
    ['order-[^0-9]', 'order-7', false],
    ['a\\*b', 'a*b', true],
    ['a\\*b', 'axb', false],
  ])('glob %s against %s is %s', (pattern, value, expected) => {
    expect(buildMatcher(pattern, 'glob', true)(value)).toBe(expected);
  });
});
