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

  function captureQuery(queueName: string) {
    const queue = makeQueue(queueName);
    const captured: MetricsLatencyQuery[] = [];
    const provider: MetricsHistoryProvider = {
      getHistory: async () => [],
      getLatency: async (query) => {
        captured.push(query);
        return [];
      },
    };

    createBullBoard({
      queues: [new BullMQAdapter(queue)],
      serverAdapter,
      options: { historyProvider: provider },
    });

    return { captured, agent: request(serverAdapter.getRouter()) };
  }

  it('falls back to the default percentiles when none are requested', async () => {
    const { captured, agent } = captureQuery('LatencyQueueNoPercentiles');

    await agent
      .get('/api/metrics/latency')
      .query({ metric: 'runtime', from: '0', to: '10', granularity: 'day' })
      .expect(200);

    expect(captured[0].percentiles).toEqual([50, 95, 99]);
  });

  it('keeps a requested p0 rather than swapping in the defaults', async () => {
    const { captured, agent } = captureQuery('LatencyQueueZeroPercentile');

    await agent
      .get('/api/metrics/latency')
      .query({ metric: 'runtime', from: '0', to: '10', granularity: 'day', percentiles: '0,50' })
      .expect(200);

    expect(captured[0].percentiles).toEqual([0, 50]);
  });

  it('drops out-of-range and non-numeric percentiles', async () => {
    const { captured, agent } = captureQuery('LatencyQueueBadPercentiles');

    await agent
      .get('/api/metrics/latency')
      .query({
        metric: 'runtime',
        from: '0',
        to: '10',
        granularity: 'day',
        percentiles: '-1,abc,101,95',
      })
      .expect(200);

    expect(captured[0].percentiles).toEqual([95]);
  });

  it('falls back to the defaults when every requested percentile is filtered out', async () => {
    const { captured, agent } = captureQuery('LatencyQueueAllBadPercentiles');

    await agent
      .get('/api/metrics/latency')
      .query({ metric: 'runtime', from: '0', to: '10', granularity: 'day', percentiles: 'abc,999' })
      .expect(200);

    expect(captured[0].percentiles).toEqual([50, 95, 99]);
  });

  it('defaults a missing from to 0 and a missing to to now', async () => {
    const { captured, agent } = captureQuery('LatencyQueueNoRange');
    const before = Date.now();

    await agent.get('/api/metrics/latency').query({ metric: 'waittime' }).expect(200);

    expect(captured[0].from).toBe(0);
    expect(captured[0].to).toBeGreaterThanOrEqual(before);
    expect(captured[0].to).toBeLessThanOrEqual(Date.now());
  });

  it('defaults a granularity that is neither hour, day, nor range to day', async () => {
    const { captured, agent } = captureQuery('LatencyQueueBadGranularity');

    await agent
      .get('/api/metrics/latency')
      .query({ metric: 'runtime', from: '0', to: '10', granularity: 'week' })
      .expect(200);

    expect(captured[0].granularity).toBe('day');
  });

  it('passes granularity=range through to the provider', async () => {
    const { captured, agent } = captureQuery('LatencyQueueRangeGranularity');

    await agent
      .get('/api/metrics/latency')
      .query({ metric: 'runtime', from: '0', to: '10', granularity: 'range' })
      .expect(200);

    expect(captured[0].granularity).toBe('range');
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
