import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import type { MetricsHistoryProvider, MetricsLatencyQuery } from '@bull-board/api/typings/app';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import request from 'supertest';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: +(process.env.REDIS_PORT || 6379),
};

describe('metrics latency endpoint', () => {
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

  function makeQueue(name: string) {
    const queue = new Queue(name, { connection });
    queueList.push(queue);
    return queue;
  }

  it('returns percentile points for a queue', async () => {
    const queue = makeQueue('LatencyQueue');
    const captured: MetricsLatencyQuery[] = [];
    const provider: MetricsHistoryProvider = {
      getHistory: async () => [],
      getLatency: async (query) => {
        captured.push(query);
        return [{ ts: 1_700_000_000_000, count: 42, values: { '50': 120, '95': 900 } }];
      },
    };

    createBullBoard({
      queues: [new BullMQAdapter(queue)],
      serverAdapter,
      options: { historyProvider: provider },
    });

    await request(serverAdapter.getRouter())
      .get('/api/metrics/latency')
      .query({
        queue: 'Test',
        metric: 'runtime',
        from: '0',
        to: '1700000000000',
        granularity: 'day',
        percentiles: '50,95',
      })
      .expect(200)
      .then((res) => {
        expect(JSON.parse(res.text)).toEqual([
          { ts: 1_700_000_000_000, count: 42, values: { '50': 120, '95': 900 } },
        ]);
      });

    expect(captured).toHaveLength(1);
    expect(captured[0]).toEqual({
      queue: 'Test',
      metric: 'runtime',
      from: 0,
      to: 1_700_000_000_000,
      granularity: 'day',
      percentiles: [50, 95],
    });
  });

  it('rejects an unknown metric with a translation key', async () => {
    const queue = makeQueue('LatencyQueueBadMetric');
    const provider: MetricsHistoryProvider = {
      getHistory: async () => [],
      getLatency: async () => [],
    };

    createBullBoard({
      queues: [new BullMQAdapter(queue)],
      serverAdapter,
      options: { historyProvider: provider },
    });

    await request(serverAdapter.getRouter())
      .get('/api/metrics/latency')
      .query({ metric: 'bogus', from: '0', to: '1', granularity: 'day', percentiles: '95' })
      .expect(400)
      .then((res) => {
        expect(JSON.parse(res.text).error).toEqual({ key: 'ERRORS.INVALID_METRIC' });
      });
  });

  it('is not registered when the provider cannot serve latency', async () => {
    const queue = makeQueue('LatencyQueueNoProvider');
    const provider: MetricsHistoryProvider = { getHistory: async () => [] };

    createBullBoard({
      queues: [new BullMQAdapter(queue)],
      serverAdapter,
      options: { historyProvider: provider },
    });

    await request(serverAdapter.getRouter())
      .get('/api/metrics/latency')
      .query({ metric: 'runtime', from: '0', to: '1', granularity: 'day' })
      .expect(404);
  });
});

describe('hasLatencyHistory uiConfig flag', () => {
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

  function makeQueue(name: string) {
    const queue = new Queue(name, { connection });
    queueList.push(queue);
    return queue;
  }

  it('injects hasLatencyHistory: true into the entry HTML when the provider supports getLatency', async () => {
    const queue = makeQueue('LatencyFlagOnQueue');
    const provider: MetricsHistoryProvider = {
      getHistory: async () => [],
      getLatency: async () => [],
    };

    createBullBoard({
      queues: [new BullMQAdapter(queue)],
      serverAdapter,
      options: { historyProvider: provider },
    });

    await request(serverAdapter.getRouter())
      .get('/')
      .expect(200)
      .then((res) => {
        expect(res.text).toContain('"hasLatencyHistory":true');
      });
  });

  it('injects hasLatencyHistory: false into the entry HTML when the provider lacks getLatency', async () => {
    const queue = makeQueue('LatencyFlagOffQueue');
    const provider: MetricsHistoryProvider = { getHistory: async () => [] };

    createBullBoard({
      queues: [new BullMQAdapter(queue)],
      serverAdapter,
      options: { historyProvider: provider },
    });

    await request(serverAdapter.getRouter())
      .get('/')
      .expect(200)
      .then((res) => {
        expect(res.text).toContain('"hasLatencyHistory":false');
      });
  });

  it('injects hasLatencyHistory: false into the entry HTML when no provider is set', async () => {
    const queue = makeQueue('LatencyFlagNoProviderQueue');
    createBullBoard({ queues: [new BullMQAdapter(queue)], serverAdapter });

    await request(serverAdapter.getRouter())
      .get('/')
      .expect(200)
      .then((res) => {
        expect(res.text).toContain('"hasLatencyHistory":false');
      });
  });
});
