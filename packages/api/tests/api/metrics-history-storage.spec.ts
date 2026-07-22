import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import type {
  MetricsHistoryProvider,
  MetricsHistoryPurgeOptions,
  MetricsHistoryUsage,
} from '@bull-board/api/typings/app';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import request from 'supertest';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: +(process.env.REDIS_PORT || 6379),
};

const emptyTiers = () => ({
  minute: { keys: 0, bytes: 0 },
  hour: { keys: 0, bytes: 0 },
  day: { keys: 0, bytes: 0 },
});

const USAGE: MetricsHistoryUsage = {
  keys: 4,
  bytes: 2048,
  minutes: 120,
  oldestDay: '2026-06-01',
  newestDay: '2026-07-01',
  tiers: { ...emptyTiers(), minute: { keys: 2, bytes: 2000 } },
  queues: [
    {
      queue: 'mailer',
      keys: 2,
      bytes: 2000,
      minutes: 120,
      days: ['2026-06-01'],
      tiers: { ...emptyTiers(), minute: { keys: 2, bytes: 2000 } },
    },
  ],
};

describe('metrics history storage endpoints', () => {
  let serverAdapter: ExpressAdapter;
  const queueList: Queue[] = [];

  beforeEach(() => {
    serverAdapter = new ExpressAdapter();
    queueList.length = 0;
  });

  afterEach(async () => {
    for (const queue of queueList) {
      await queue.obliterate({ force: true }).catch(() => undefined);
      await queue.close();
    }
  });

  function makeQueue(name: string, opts: { readOnlyMode?: boolean } = {}) {
    const queue = new Queue(name, { connection });
    queueList.push(queue);
    return new BullMQAdapter(queue, opts);
  }

  function fullProvider(purges: MetricsHistoryPurgeOptions[] = []): MetricsHistoryProvider {
    return {
      getHistory: async () => [],
      getUsage: async () => USAGE,
      purge: async (options) => {
        purges.push(options);
        return { keysDeleted: 3, fieldsDeleted: 7 };
      },
    };
  }

  describe('capability gating', () => {
    it('registers neither route for a read-only provider', async () => {
      createBullBoard({
        queues: [makeQueue('StorageNoCapsQueue')],
        serverAdapter,
        options: { historyProvider: { getHistory: async () => [] } },
      });

      const router = request(serverAdapter.getRouter());
      await router.get('/api/metrics/history/usage').expect(404);
      await router.post('/api/metrics/history/purge').send({}).expect(404);
    });

    it('registers neither route when no provider is configured at all', async () => {
      createBullBoard({ queues: [makeQueue('StorageNoProviderQueue')], serverAdapter });

      const router = request(serverAdapter.getRouter());
      await router.get('/api/metrics/history/usage').expect(404);
      await router.post('/api/metrics/history/purge').send({}).expect(404);
    });

    it('registers usage but not purge when the provider only reports usage', async () => {
      createBullBoard({
        queues: [makeQueue('StorageUsageOnlyQueue')],
        serverAdapter,
        options: {
          historyProvider: { getHistory: async () => [], getUsage: async () => USAGE },
        },
      });

      const router = request(serverAdapter.getRouter());
      await router.get('/api/metrics/history/usage').expect(200);
      await router.post('/api/metrics/history/purge').send({}).expect(404);
    });

    it('withholds purge when every queue is read-only', async () => {
      createBullBoard({
        queues: [makeQueue('StorageReadOnlyQueue', { readOnlyMode: true })],
        serverAdapter,
        options: { historyProvider: fullProvider() },
      });

      const router = request(serverAdapter.getRouter());
      await router.get('/api/metrics/history/usage').expect(200);
      await router.post('/api/metrics/history/purge').send({}).expect(404);
    });

    it('allows purge when at least one queue is writable', async () => {
      createBullBoard({
        queues: [
          makeQueue('StorageMixedReadOnlyQueue', { readOnlyMode: true }),
          makeQueue('StorageMixedWritableQueue'),
        ],
        serverAdapter,
        options: { historyProvider: fullProvider() },
      });

      await request(serverAdapter.getRouter())
        .post('/api/metrics/history/purge')
        .send({})
        .expect(200);
    });
  });

  describe('uiConfig flags', () => {
    it('advertises both capabilities when the provider has them', async () => {
      createBullBoard({
        queues: [makeQueue('StorageFlagsOnQueue')],
        serverAdapter,
        options: { historyProvider: fullProvider() },
      });

      await request(serverAdapter.getRouter())
        .get('/')
        .expect(200)
        .then((res) => {
          expect(res.text).toContain('"hasHistoryUsage":true');
          expect(res.text).toContain('"canPurgeHistory":true');
        });
    });

    it('advertises them as false without a provider', async () => {
      createBullBoard({ queues: [makeQueue('StorageFlagsOffQueue')], serverAdapter });

      await request(serverAdapter.getRouter())
        .get('/')
        .expect(200)
        .then((res) => {
          expect(res.text).toContain('"hasHistoryUsage":false');
          expect(res.text).toContain('"canPurgeHistory":false');
        });
    });

    it('does not let caller uiConfig force the flags on', async () => {
      // Same rule as hasHistoryProvider: the flags gate UI whose routes only exist when
      // the provider really implements them, so a stray uiConfig can't switch them on.
      createBullBoard({
        queues: [makeQueue('StorageFlagsForcedQueue')],
        serverAdapter,
        options: { uiConfig: { hasHistoryUsage: true, canPurgeHistory: true } },
      });

      await request(serverAdapter.getRouter())
        .get('/')
        .expect(200)
        .then((res) => {
          expect(res.text).toContain('"hasHistoryUsage":false');
          expect(res.text).toContain('"canPurgeHistory":false');
        });
    });
  });

  describe('usage endpoint', () => {
    it('returns the provider payload verbatim', async () => {
      createBullBoard({
        queues: [makeQueue('StorageUsageQueue')],
        serverAdapter,
        options: { historyProvider: fullProvider() },
      });

      await request(serverAdapter.getRouter())
        .get('/api/metrics/history/usage')
        .expect(200)
        .then((res) => {
          expect(res.body).toEqual(USAGE);
        });
    });

    it('surfaces a provider failure as a structured 500', async () => {
      createBullBoard({
        queues: [makeQueue('StorageUsageFailQueue')],
        serverAdapter,
        options: {
          historyProvider: {
            getHistory: async () => [],
            getUsage: async () => {
              throw new Error('redis is down');
            },
          },
        },
      });

      await request(serverAdapter.getRouter())
        .get('/api/metrics/history/usage')
        .expect(500)
        .then((res) => {
          expect(res.body.error).toBeDefined();
        });
    });
  });

  describe('purge endpoint', () => {
    it('passes no scope through for a full purge', async () => {
      const purges: MetricsHistoryPurgeOptions[] = [];
      createBullBoard({
        queues: [makeQueue('StoragePurgeAllQueue')],
        serverAdapter,
        options: { historyProvider: fullProvider(purges) },
      });

      await request(serverAdapter.getRouter())
        .post('/api/metrics/history/purge')
        .send({})
        .expect(200)
        .then((res) => {
          expect(res.body).toEqual({ keysDeleted: 3, fieldsDeleted: 7 });
        });

      expect(purges).toEqual([{ queue: undefined, before: undefined }]);
    });

    it('forwards queue and before', async () => {
      const purges: MetricsHistoryPurgeOptions[] = [];
      createBullBoard({
        queues: [makeQueue('StoragePurgeScopedQueue')],
        serverAdapter,
        options: { historyProvider: fullProvider(purges) },
      });

      await request(serverAdapter.getRouter())
        .post('/api/metrics/history/purge')
        .send({ queue: 'mailer', before: '2026-06-01' })
        .expect(200);

      expect(purges).toEqual([{ queue: 'mailer', before: '2026-06-01' }]);
    });

    it('rejects a malformed cutoff rather than purging everything', async () => {
      // The dangerous failure mode: a bad `before` silently dropping to "no cutoff"
      // turns a trim request into a full wipe.
      const purges: MetricsHistoryPurgeOptions[] = [];
      createBullBoard({
        queues: [makeQueue('StoragePurgeBadCutoffQueue')],
        serverAdapter,
        options: { historyProvider: fullProvider(purges) },
      });

      const router = request(serverAdapter.getRouter());
      for (const before of ['yesterday', '01/06/2026', '2026-6-1', '', 42]) {
        await router.post('/api/metrics/history/purge').send({ before }).expect(400);
      }

      expect(purges).toEqual([]);
    });

    it('rejects a non-string queue', async () => {
      const purges: MetricsHistoryPurgeOptions[] = [];
      createBullBoard({
        queues: [makeQueue('StoragePurgeBadQueueQueue')],
        serverAdapter,
        options: { historyProvider: fullProvider(purges) },
      });

      await request(serverAdapter.getRouter())
        .post('/api/metrics/history/purge')
        .send({ queue: { evil: true } })
        .expect(400);

      expect(purges).toEqual([]);
    });

    it('surfaces a provider failure as a structured 500', async () => {
      createBullBoard({
        queues: [makeQueue('StoragePurgeFailQueue')],
        serverAdapter,
        options: {
          historyProvider: {
            getHistory: async () => [],
            purge: async () => {
              throw new Error('redis is down');
            },
          },
        },
      });

      await request(serverAdapter.getRouter())
        .post('/api/metrics/history/purge')
        .send({})
        .expect(500)
        .then((res) => {
          expect(res.body.error).toBeDefined();
        });
    });
  });
});
