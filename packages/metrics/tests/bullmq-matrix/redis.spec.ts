import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { MetricsTime, Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { vectorTotal } from '../../src/histogram';
import { HistoryStore } from '../../src/HistoryStore';
import { minuteToDay } from '../../src/keys';
import { LatencySampler } from '../../src/LatencySampler';
import { LatencyStore } from '../../src/LatencyStore';
import { MetricsRecorder } from '../../src/MetricsRecorder';
import { assertResolvedMajor, connection, resetHistory, uniqueName, waitFor } from './helpers';

const RETENTION = { minutes: 7, hours: 90, days: 90 };

describe('Redis-backed queues', () => {
  assertResolvedMajor();

  let redis: Redis;
  let queue: Queue;
  let worker: Worker | undefined;
  let adapter: BullMQAdapter;
  let name: string;

  beforeAll(() => {
    redis = new Redis(connection);
  });

  afterAll(async () => {
    await redis.quit();
  });

  beforeEach(async () => {
    queue = new Queue(uniqueName('redis'), { connection });
    await queue.waitUntilReady();
    adapter = new BullMQAdapter(queue);
    name = adapter.getName();
    await resetHistory(redis, name);
  });

  afterEach(async () => {
    await worker?.close();
    worker = undefined;
    await queue?.obliterate({ force: true }).catch(() => undefined);
    await queue?.close();
    await resetHistory(redis, name);
  });

  async function runJobs(count: number, total: number, withMetrics = true): Promise<void> {
    await queue.addBulk(Array.from({ length: count }, (_, i) => ({ name: 'job', data: { i } })));
    worker =
      worker ??
      new Worker(queue.name, async () => 'ok', {
        connection,
        ...(withMetrics ? { metrics: { maxDataPoints: MetricsTime.ONE_HOUR } } : {}),
      });
    await waitFor(async () => (await queue.getCompletedCount()) >= total, 'jobs did not complete');
  }

  it('records native counter metrics into history', async () => {
    await runJobs(3, 3);
    await redis.hset(queue.toKey('metrics:completed'), 'prevTS', String(Date.now() - 120000));
    await runJobs(1, 4);
    await waitFor(
      async () => ((await adapter.getMetrics('completed')).data?.length ?? 0) > 0,
      'metrics buffer did not finalize a minute'
    );

    const recorder = new MetricsRecorder({ queues: [adapter], connection: redis, latency: false });
    await recorder.snapshot();
    recorder.stop();

    const store = new HistoryStore({ redis, retention: RETENTION });
    const today = minuteToDay(Date.now() / 60000);
    const [stored] = await store.readDailyTotalsRaw(name, 'completed', [today]);
    expect(Number(stored)).toBeGreaterThanOrEqual(3);
  });

  it('samples job durations into the latency store', async () => {
    await runJobs(3, 3, false);

    const store = new LatencyStore({ redis, retention: RETENTION });
    const sampler = new LatencySampler({ redis, store, tickMs: 60000, safetyMarginMs: 0 });
    await sampler.sample(adapter);

    const today = minuteToDay(Date.now() / 60000);
    const days = await store.readRange(name, 'runtime', 'day', [today]);
    expect(vectorTotal(days[today] ?? [])).toBe(3);
  });
});
