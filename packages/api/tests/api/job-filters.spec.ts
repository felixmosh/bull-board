import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import request from 'supertest';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: +(process.env.REDIS_PORT || 6379),
};

const QUEUE_NAME = 'BullBoardJobFiltersSpec';

describe('job filters', () => {
  let queue: Queue;
  let serverAdapter: ExpressAdapter;

  const list = (query: Record<string, string>) =>
    request(serverAdapter.getRouter())
      .get('/api/queues')
      .query({ activeQueue: QUEUE_NAME, status: 'waiting', ...query });

  const body = (res: request.Response) =>
    JSON.parse(res.text).queues.find((q: any) => q.name === QUEUE_NAME);

  const ids = (res: request.Response) => body(res).jobs.map((job: any) => job.id);

  beforeAll(async () => {
    queue = new Queue(QUEUE_NAME, { connection });
    await queue.obliterate({ force: true });
    const base = Date.now() - 10_000;
    await queue.add(
      'webhook',
      { payload: { organizationId: 77 } },
      { jobId: 'job-a', timestamp: base }
    );
    await queue.add(
      'webhook',
      { payload: { organizationId: 12 } },
      { jobId: 'job-b', timestamp: base + 1000 }
    );
    await queue.add(
      'email',
      { payload: { organizationId: 77 } },
      { jobId: 'job-c', timestamp: base + 2000 }
    );
    serverAdapter = new ExpressAdapter();
    createBullBoard({ queues: [new BullMQAdapter(queue)], serverAdapter });
  });

  afterAll(async () => {
    await queue.obliterate({ force: true }).catch(() => undefined);
    await queue.close();
  });

  it('searches the job data with a JSONata expression', async () => {
    const res = await list({ search: 'data.payload.organizationId = 77' }).expect(200);
    expect(ids(res).sort()).toEqual(['job-a', 'job-c']);
    expect(body(res).search).toEqual({ matched: 2, scanned: 3, truncated: false });
  });

  it('combines conditions on name and data', async () => {
    const res = await list({
      search: 'name = "webhook" and data.payload.organizationId = 77',
    }).expect(200);
    expect(ids(res)).toEqual(['job-a']);
  });

  it('finds a job by its exact id', async () => {
    const res = await list({ jobId: 'job-b' }).expect(200);
    expect(ids(res)).toEqual(['job-b']);
  });

  it('does not show a job id from another status', async () => {
    const res = await list({ jobId: 'job-b', status: 'completed' }).expect(200);
    expect(ids(res)).toEqual([]);
  });

  it('applies the search to a job id lookup too', async () => {
    const res = await list({ jobId: 'job-b', search: 'data.payload.organizationId = 77' });
    expect(ids(res)).toEqual([]);
  });

  it('orders the list oldest first with order=asc', async () => {
    const desc = await list({}).expect(200);
    const asc = await list({ order: 'asc' }).expect(200);
    expect(ids(asc)).toEqual([...ids(desc)].reverse());
  });

  it('orders search results too', async () => {
    const desc = await list({ search: 'data.payload.organizationId = 77' });
    const asc = await list({ search: 'data.payload.organizationId = 77', order: 'asc' });
    expect(ids(asc)).toEqual([...ids(desc)].reverse());
  });

  it('answers 400 with a translation key for an expression that does not parse', async () => {
    const res = await list({ search: 'data.payload.organizationId = ' }).expect(400);
    expect(JSON.parse(res.text).error).toEqual({ key: 'ERRORS.INVALID_SEARCH_EXPRESSION' });
  });

  it('rejects an unknown order', async () => {
    await list({ order: 'sideways' }).expect(400);
  });

  it('leaves the response unchanged without filters', async () => {
    const res = await list({}).expect(200);
    expect(ids(res)).toHaveLength(3);
    expect(body(res).search).toBeUndefined();
  });
});
