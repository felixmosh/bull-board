import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import type { JobSearchProvider, JobSearchQuery } from '@bull-board/api/typings/app';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import request from 'supertest';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: +(process.env.REDIS_PORT || 6379),
};

function fakeProvider(jobIds: string[], cursor?: string) {
  const calls: JobSearchQuery[] = [];
  const provider: JobSearchProvider = {
    fields: async () => ['data.tenantId'],
    search: async (query) => {
      calls.push(query);
      return { jobIds, cursor };
    },
  };
  return { provider, calls };
}

describe('Job search', () => {
  let serverAdapter: ExpressAdapter;
  let queue: Queue;

  beforeEach(() => {
    serverAdapter = new ExpressAdapter();
  });

  afterEach(async () => {
    await queue.obliterate({ force: true }).catch(() => {});
    await queue.close();
  });

  function board(adapter: BullMQAdapter) {
    createBullBoard({ queues: [adapter], serverAdapter });
    return request(serverAdapter.getRouter());
  }

  it('returns the provider hits as formatted jobs with their state, skipping ids that no longer exist', async () => {
    queue = new Queue('SearchHits', { connection });
    await queue.pause();
    const job = await queue.add('order', { tenantId: 'acme' });
    const { provider, calls } = fakeProvider([job.id as string, 'gone'], 'next-page');

    const res = await board(new BullMQAdapter(queue, { search: provider }))
      .get('/api/queues/SearchHits/search')
      .query({ field: 'data.tenantId', value: 'acme', cursor: 'abc', limit: '5' })
      .expect(200);

    expect(calls).toEqual([
      { field: 'data.tenantId', value: 'acme', status: undefined, cursor: 'abc', limit: 5 },
    ]);
    expect(res.body.cursor).toBe('next-page');
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].job).toMatchObject({ id: job.id, data: { tenantId: 'acme' } });
    expect(res.body.results[0].status).toBe('waiting');
  });

  it('drops hits whose current state does not match the requested status', async () => {
    queue = new Queue('SearchStatus', { connection });
    await queue.pause();
    const waiting = await queue.add('order', { tenantId: 'acme' });
    const delayed = await queue.add('order', { tenantId: 'acme' }, { delay: 60_000 });
    const { provider, calls } = fakeProvider([waiting.id as string, delayed.id as string]);

    const res = await board(new BullMQAdapter(queue, { search: provider }))
      .get('/api/queues/SearchStatus/search')
      .query({ field: 'data.tenantId', value: 'acme', status: 'delayed' })
      .expect(200);

    expect(calls[0].status).toBe('delayed');
    expect(res.body.results.map((r: any) => r.job.id)).toEqual([delayed.id]);
  });

  it('passes no status to the provider for the latest tab', async () => {
    queue = new Queue('SearchLatest', { connection });
    const { provider, calls } = fakeProvider([]);

    await board(new BullMQAdapter(queue, { search: provider }))
      .get('/api/queues/SearchLatest/search')
      .query({ field: 'data.tenantId', value: 'acme', status: 'latest' })
      .expect(200);

    expect(calls[0].status).toBeUndefined();
  });

  it('rejects a field the provider does not index without calling search', async () => {
    queue = new Queue('SearchUnknownField', { connection });
    const { provider, calls } = fakeProvider([]);

    const res = await board(new BullMQAdapter(queue, { search: provider }))
      .get('/api/queues/SearchUnknownField/search')
      .query({ field: 'data.email', value: 'x' })
      .expect(400);

    expect(res.body.error).toEqual({
      key: 'ERRORS.SEARCH_FIELD_NOT_INDEXED',
      options: { field: 'data.email' },
    });
    expect(calls).toHaveLength(0);
  });

  it('answers 404 on both routes when the queue has no provider', async () => {
    queue = new Queue('SearchNone', { connection });
    const app = board(new BullMQAdapter(queue));

    const fields = await app.get('/api/queues/SearchNone/search/fields').expect(404);
    const search = await app
      .get('/api/queues/SearchNone/search')
      .query({ field: 'data.tenantId', value: 'acme' })
      .expect(404);

    expect(fields.body.error).toEqual({ key: 'ERRORS.SEARCH_NOT_CONFIGURED' });
    expect(search.body.error).toEqual({ key: 'ERRORS.SEARCH_NOT_CONFIGURED' });
  });

  it('lists the searchable fields and flags the queue as searchable', async () => {
    queue = new Queue('SearchFields', { connection });
    const { provider } = fakeProvider([]);
    const app = board(new BullMQAdapter(queue, { search: provider }));

    const fields = await app.get('/api/queues/SearchFields/search/fields').expect(200);
    const queues = await app.get('/api/queues').expect(200);

    expect(fields.body).toEqual({ fields: ['data.tenantId'] });
    expect(queues.body.queues[0].searchable).toBe(true);
  });

  it('works on a read-only queue', async () => {
    queue = new Queue('SearchReadOnly', { connection });
    const { provider } = fakeProvider([]);

    await board(new BullMQAdapter(queue, { search: provider, readOnlyMode: true }))
      .get('/api/queues/SearchReadOnly/search')
      .query({ field: 'data.tenantId', value: 'acme' })
      .expect(200);
  });

  it('hides search on a queue the visibility guard hides', async () => {
    queue = new Queue('SearchHidden', { connection });
    const { provider, calls } = fakeProvider([]);
    const adapter = new BullMQAdapter(queue, { search: provider });
    adapter.setVisibilityGuard(() => false);

    await board(adapter)
      .get('/api/queues/SearchHidden/search')
      .query({ field: 'data.tenantId', value: 'acme' })
      .expect(404);

    expect(calls).toHaveLength(0);
  });

  it('rejects an empty value', async () => {
    queue = new Queue('SearchEmpty', { connection });
    const { provider, calls } = fakeProvider([]);

    await board(new BullMQAdapter(queue, { search: provider }))
      .get('/api/queues/SearchEmpty/search')
      .query({ field: 'data.tenantId', value: '' })
      .expect(400);

    expect(calls).toHaveLength(0);
  });
});
