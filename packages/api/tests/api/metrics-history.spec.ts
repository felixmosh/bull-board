import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import type { MetricsHistoryProvider, MetricsHistoryQuery } from '@bull-board/api/typings/app';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import request from 'supertest';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: +(process.env.REDIS_PORT || 6379),
};

describe('metrics history endpoint', () => {
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

  it('returns 404 when no historyProvider is configured', async () => {
    const queue = makeQueue('NoHistoryQueue');
    createBullBoard({ queues: [new BullMQAdapter(queue)], serverAdapter });

    await request(serverAdapter.getRouter()).get('/api/metrics/history').expect(404);
  });

  it('delegates to the provider and returns both metric arrays', async () => {
    const queue = makeQueue('HistoryQueue');
    const captured: MetricsHistoryQuery[] = [];
    const provider: MetricsHistoryProvider = {
      getHistory: async (query) => {
        captured.push(query);
        return [{ ts: 60000, value: 3 }];
      },
    };

    createBullBoard({
      queues: [new BullMQAdapter(queue)],
      serverAdapter,
      options: { historyProvider: provider },
    });

    await request(serverAdapter.getRouter())
      .get('/api/metrics/history')
      .query({ from: '0', to: '120000', granularity: 'day' })
      .expect(200)
      .then((res) => {
        const body = JSON.parse(res.text);
        expect(body.completed).toEqual([{ ts: 60000, value: 3 }]);
        expect(body.failed).toEqual([{ ts: 60000, value: 3 }]);
      });

    expect(captured).toHaveLength(2);
    expect(captured[0]).toEqual({
      queue: undefined,
      metric: 'completed',
      from: 0,
      to: 120000,
      granularity: 'day',
    });
    expect(captured[1]).toEqual({
      queue: undefined,
      metric: 'failed',
      from: 0,
      to: 120000,
      granularity: 'day',
    });
  });

  it('passes the queue name through to the provider when given', async () => {
    const queue = makeQueue('HistoryQueueWithName');
    const captured: MetricsHistoryQuery[] = [];
    const provider: MetricsHistoryProvider = {
      getHistory: async (query) => {
        captured.push(query);
        return [];
      },
    };

    createBullBoard({
      queues: [new BullMQAdapter(queue)],
      serverAdapter,
      options: { historyProvider: provider },
    });

    await request(serverAdapter.getRouter())
      .get('/api/metrics/history')
      .query({
        queue: 'SomeQueue',
        from: '0',
        to: '120000',
        granularity: 'day',
      })
      .expect(200);

    expect(captured).toHaveLength(2);
    expect(captured[0].queue).toBe('SomeQueue');
    expect(captured[1].queue).toBe('SomeQueue');
  });

  it('defaults granularity to "day" when omitted', async () => {
    const queue = makeQueue('HistoryQueueDefaultGranularity');
    const captured: MetricsHistoryQuery[] = [];
    const provider: MetricsHistoryProvider = {
      getHistory: async (query) => {
        captured.push(query);
        return [];
      },
    };

    createBullBoard({
      queues: [new BullMQAdapter(queue)],
      serverAdapter,
      options: { historyProvider: provider },
    });

    await request(serverAdapter.getRouter())
      .get('/api/metrics/history')
      .query({ from: '0', to: '120000' })
      .expect(200);

    expect(captured).toHaveLength(2);
    expect(captured[0].granularity).toBe('day');
    expect(captured[1].granularity).toBe('day');
  });

  it('passes granularity "hour" through to the provider', async () => {
    const queue = makeQueue('HistoryQueueHourly');
    const captured: MetricsHistoryQuery[] = [];
    const provider: MetricsHistoryProvider = {
      getHistory: async (query) => {
        captured.push(query);
        return [];
      },
    };

    createBullBoard({
      queues: [new BullMQAdapter(queue)],
      serverAdapter,
      options: { historyProvider: provider },
    });

    await request(serverAdapter.getRouter())
      .get('/api/metrics/history')
      .query({ from: '0', to: '120000', granularity: 'hour' })
      .expect(200);

    expect(captured).toHaveLength(2);
    expect(captured[0].granularity).toBe('hour');
    expect(captured[1].granularity).toBe('hour');
  });

  it('returns a structured 500 when the provider rejects', async () => {
    const queue = makeQueue('HistoryQueueThrows');
    const provider: MetricsHistoryProvider = {
      getHistory: async () => {
        throw new Error('provider boom');
      },
    };

    createBullBoard({
      queues: [new BullMQAdapter(queue)],
      serverAdapter,
      options: { historyProvider: provider },
    });

    await request(serverAdapter.getRouter())
      .get('/api/metrics/history')
      .query({ from: '0', to: '120000', granularity: 'day' })
      .expect(500)
      .then((res) => {
        const body = JSON.parse(res.text);
        expect(body.error).toBeDefined();
      });
  });

  it('returns 400 for an invalid granularity', async () => {
    const queue = makeQueue('BadGranularityQueue');
    const provider: MetricsHistoryProvider = { getHistory: async () => [] };
    createBullBoard({
      queues: [new BullMQAdapter(queue)],
      serverAdapter,
      options: { historyProvider: provider },
    });

    await request(serverAdapter.getRouter())
      .get('/api/metrics/history')
      .query({ from: '0', to: '1', granularity: 'week' })
      .expect(400);
  });

  it('returns 400 when the range is inverted or non-finite', async () => {
    const queue = makeQueue('BadRangeQueue');
    const calls: number[] = [];
    const provider: MetricsHistoryProvider = {
      getHistory: async () => {
        calls.push(1);
        return [];
      },
    };
    createBullBoard({
      queues: [new BullMQAdapter(queue)],
      serverAdapter,
      options: { historyProvider: provider },
    });

    const router = serverAdapter.getRouter();

    await request(router)
      .get('/api/metrics/history')
      .query({ from: '100', to: '10', granularity: 'day' })
      .expect(400);

    await request(router)
      .get('/api/metrics/history')
      .query({ from: 'abc', to: '10', granularity: 'day' })
      .expect(400);

    expect(calls).toHaveLength(0);
  });

  it("returns 400 when from is an empty string (Number('') would otherwise coerce to 0)", async () => {
    const queue = makeQueue('EmptyFromQueue');
    const calls: number[] = [];
    const provider: MetricsHistoryProvider = {
      getHistory: async () => {
        calls.push(1);
        return [];
      },
    };
    createBullBoard({
      queues: [new BullMQAdapter(queue)],
      serverAdapter,
      options: { historyProvider: provider },
    });

    await request(serverAdapter.getRouter())
      .get('/api/metrics/history')
      .query({ from: '', to: '100', granularity: 'day' })
      .expect(400);

    expect(calls).toHaveLength(0);
  });
});

describe('hasHistoryProvider uiConfig flag', () => {
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

  it('injects hasHistoryProvider: true into the entry HTML when a provider is set', async () => {
    const queue = makeQueue('FlagOnQueue');
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
        expect(res.text).toContain('"hasHistoryProvider":true');
      });
  });

  it('injects hasHistoryProvider: false into the entry HTML when no provider is set', async () => {
    const queue = makeQueue('FlagOffQueue');
    createBullBoard({ queues: [new BullMQAdapter(queue)], serverAdapter });

    await request(serverAdapter.getRouter())
      .get('/')
      .expect(200)
      .then((res) => {
        expect(res.text).toContain('"hasHistoryProvider":false');
      });
  });

  it('does not let caller uiConfig force hasHistoryProvider true without a provider', async () => {
    const queue = makeQueue('FlagForcedQueue');
    createBullBoard({
      queues: [new BullMQAdapter(queue)],
      serverAdapter,
      options: { uiConfig: { hasHistoryProvider: true } },
    });

    await request(serverAdapter.getRouter())
      .get('/')
      .expect(200)
      .then((res) => {
        expect(res.text).toContain('"hasHistoryProvider":false');
      });
  });
});
