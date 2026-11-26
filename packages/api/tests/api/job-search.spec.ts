import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import type {
  JobSearchDiagnostics,
  JobSearchProvider,
  JobSearchQuery,
} from '@bull-board/api/typings/app';
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

  it('finds jobs on the paused tab of a paused queue', async () => {
    queue = new Queue('SearchPaused', { connection });
    await queue.pause();
    const first = await queue.add('order', { tenantId: 'acme' });
    const second = await queue.add('order', { tenantId: 'acme' });
    const { provider } = fakeProvider([first.id as string, second.id as string]);
    const api = board(new BullMQAdapter(queue, { search: provider }));

    const paused = await api
      .get('/api/queues/SearchPaused/search')
      .query({ field: 'data.tenantId', value: 'acme', status: 'paused' })
      .expect(200);
    const waiting = await api
      .get('/api/queues/SearchPaused/search')
      .query({ field: 'data.tenantId', value: 'acme', status: 'waiting' })
      .expect(200);

    expect(paused.body.results.map((r: any) => [r.job.id, r.status])).toEqual([
      [first.id, 'paused'],
      [second.id, 'paused'],
    ]);
    expect(waiting.body.results.map((r: any) => [r.job.id, r.status])).toEqual([
      [first.id, 'waiting'],
      [second.id, 'waiting'],
    ]);
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

    expect(fields.body).toEqual({
      fields: ['data.tenantId'],
      diagnostics: { status: false, inspect: false, coverage: false },
    });
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

  describe('diagnostics', () => {
    const status = { health: 'ok' as const, reasons: [], indexedJobs: 3 };
    const inspection = { fields: [{ field: 'data.tenantId', values: ['acme'], indexed: true }] };
    const coverage = { checked: 10, missing: ['7'] };

    function withDiagnostics(diagnostics?: JobSearchDiagnostics) {
      const { provider } = fakeProvider([]);
      return { ...provider, ...(diagnostics ? { diagnostics } : {}) };
    }

    function fullDiagnostics() {
      const checkCoverage = jest.fn(async (_options: { sample: number }) => coverage);
      const inspect = jest.fn(async (_jobId: string) => inspection);
      const diagnostics: JobSearchDiagnostics = {
        status: async () => status,
        inspect,
        checkCoverage,
      };
      return { diagnostics, checkCoverage, inspect };
    }

    const paths = ['status', 'coverage', 'jobs/abc'];

    it('reports which diagnostics the provider offers', async () => {
      queue = new Queue('SearchDiagFlags', { connection });
      const app = board(
        new BullMQAdapter(queue, { search: withDiagnostics(fullDiagnostics().diagnostics) })
      );
      const full = await app.get('/api/queues/SearchDiagFlags/search/fields').expect(200);
      expect(full.body.diagnostics).toEqual({ status: true, inspect: true, coverage: true });
      await queue.obliterate({ force: true }).catch(() => {});
      await queue.close();

      queue = new Queue('SearchDiagNone', { connection });
      const none = await board(new BullMQAdapter(queue, { search: withDiagnostics() }))
        .get('/api/queues/SearchDiagNone/search/fields')
        .expect(200);
      expect(none.body.diagnostics).toEqual({ status: false, inspect: false, coverage: false });
      await queue.obliterate({ force: true }).catch(() => {});
      await queue.close();

      queue = new Queue('SearchDiagStatusOnly', { connection });
      const partial = await board(
        new BullMQAdapter(queue, { search: withDiagnostics({ status: async () => status }) })
      )
        .get('/api/queues/SearchDiagStatusOnly/search/fields')
        .expect(200);
      expect(partial.body.diagnostics).toEqual({ status: true, inspect: false, coverage: false });
    });

    it('serves the provider status', async () => {
      queue = new Queue('SearchDiagStatus', { connection });
      const app = board(
        new BullMQAdapter(queue, { search: withDiagnostics(fullDiagnostics().diagnostics) })
      );

      const res = await app.get('/api/queues/SearchDiagStatus/search/status').expect(200);

      expect(res.body).toEqual(status);
    });

    it('answers a SEARCH_STATUS_UNAVAILABLE code when the status read throws', async () => {
      queue = new Queue('SearchDiagStatusFails', { connection });
      const app = board(
        new BullMQAdapter(queue, {
          search: withDiagnostics({
            status: async () => {
              throw new Error('Connection is closed.');
            },
          }),
        })
      );

      const res = await app.get('/api/queues/SearchDiagStatusFails/search/status').expect(500);

      expect(res.body).toEqual({
        error: { key: 'ERRORS.INTERNAL_SERVER_ERROR' },
        code: 'SEARCH_STATUS_UNAVAILABLE',
        message: 'Connection is closed.',
      });
    });

    it('answers 404 SEARCH_DIAGNOSTICS_NOT_SUPPORTED when the method is missing', async () => {
      queue = new Queue('SearchDiagMissing', { connection });
      const app = board(
        new BullMQAdapter(queue, { search: withDiagnostics({ status: async () => status }) })
      );

      for (const path of ['coverage', 'jobs/abc']) {
        const res = await app.get(`/api/queues/SearchDiagMissing/search/${path}`).expect(404);
        expect(res.body.error).toEqual({ key: 'ERRORS.SEARCH_DIAGNOSTICS_NOT_SUPPORTED' });
      }
    });

    it('answers 404 SEARCH_DIAGNOSTICS_NOT_SUPPORTED when the provider has no diagnostics', async () => {
      queue = new Queue('SearchDiagAbsent', { connection });
      const app = board(new BullMQAdapter(queue, { search: withDiagnostics() }));

      for (const path of paths) {
        const res = await app.get(`/api/queues/SearchDiagAbsent/search/${path}`).expect(404);
        expect(res.body.error).toEqual({ key: 'ERRORS.SEARCH_DIAGNOSTICS_NOT_SUPPORTED' });
      }
    });

    it('answers 404 SEARCH_NOT_CONFIGURED without a provider', async () => {
      queue = new Queue('SearchDiagNoProvider', { connection });
      const app = board(new BullMQAdapter(queue));

      for (const path of paths) {
        const res = await app.get(`/api/queues/SearchDiagNoProvider/search/${path}`).expect(404);
        expect(res.body.error).toEqual({ key: 'ERRORS.SEARCH_NOT_CONFIGURED' });
      }
    });

    it('passes sample to checkCoverage and bounds it', async () => {
      queue = new Queue('SearchDiagCoverage', { connection });
      const { diagnostics, checkCoverage } = fullDiagnostics();
      const app = board(new BullMQAdapter(queue, { search: withDiagnostics(diagnostics) }));
      const url = '/api/queues/SearchDiagCoverage/search/coverage';

      const explicit = await app.get(url).query({ sample: 50 }).expect(200);
      await app.get(url).expect(200);
      await app.get(url).query({ sample: 0 }).expect(400);
      await app.get(url).query({ sample: 1001 }).expect(400);

      expect(explicit.body).toEqual(coverage);
      expect(checkCoverage.mock.calls).toEqual([[{ sample: 50 }], [{ sample: 200 }]]);
    });

    it('passes the job id to inspect', async () => {
      queue = new Queue('SearchDiagInspect', { connection });
      const { diagnostics, inspect } = fullDiagnostics();
      const app = board(new BullMQAdapter(queue, { search: withDiagnostics(diagnostics) }));

      const res = await app.get('/api/queues/SearchDiagInspect/search/jobs/abc').expect(200);

      expect(res.body).toEqual(inspection);
      expect(inspect).toHaveBeenCalledWith('abc');
    });
  });
});
