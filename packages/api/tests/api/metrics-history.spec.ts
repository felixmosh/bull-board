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

  it('delegates to the provider and returns points', async () => {
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
      .query({ metric: 'completed', from: '0', to: '120000', granularity: 'day' })
      .expect(200)
      .then((res) => {
        const body = JSON.parse(res.text);
        expect(body.points).toEqual([{ ts: 60000, value: 3 }]);
      });

    expect(captured[0]).toEqual({
      queue: undefined,
      metric: 'completed',
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
        metric: 'completed',
        from: '0',
        to: '120000',
        granularity: 'day',
      })
      .expect(200);

    expect(captured[0]).toEqual({
      queue: 'SomeQueue',
      metric: 'completed',
      from: 0,
      to: 120000,
      granularity: 'day',
    });
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
      .query({ metric: 'completed', from: '0', to: '120000' })
      .expect(200);

    expect(captured[0]).toEqual({
      queue: undefined,
      metric: 'completed',
      from: 0,
      to: 120000,
      granularity: 'day',
    });
  });

  it('returns 400 for an invalid metric', async () => {
    const queue = makeQueue('BadMetricQueue');
    const provider: MetricsHistoryProvider = { getHistory: async () => [] };
    createBullBoard({
      queues: [new BullMQAdapter(queue)],
      serverAdapter,
      options: { historyProvider: provider },
    });

    await request(serverAdapter.getRouter())
      .get('/api/metrics/history')
      .query({ metric: 'bogus', from: '0', to: '1', granularity: 'day' })
      .expect(400);
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
      .query({ metric: 'completed', from: '0', to: '1', granularity: 'week' })
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
      .query({ metric: 'completed', from: '100', to: '10', granularity: 'day' })
      .expect(400);

    await request(router)
      .get('/api/metrics/history')
      .query({ metric: 'completed', from: 'abc', to: '10', granularity: 'day' })
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
      .query({ metric: 'completed', from: '', to: '100', granularity: 'day' })
      .expect(400);

    expect(calls).toHaveLength(0);
  });
});
