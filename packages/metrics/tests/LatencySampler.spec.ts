import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { vectorTotal } from '../src/histogram';
import { NAMESPACE, minuteToDay } from '../src/keys';
import { LatencySampler } from '../src/LatencySampler';
import { LatencyStore } from '../src/LatencyStore';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: +(process.env.REDIS_PORT || 6379),
  db: +(process.env.REDIS_TEST_DB || 15),
};

const QUEUE = 'LatencySamplerQueue';

describe('LatencySampler', () => {
  let redis: Redis;
  let queue: Queue;
  let worker: Worker | undefined;
  let store: LatencyStore;
  let sampler: LatencySampler;
  let adapter: BullMQAdapter;

  beforeAll(() => {
    redis = new Redis(connection);
  });

  afterAll(async () => {
    await redis.quit();
  });

  beforeEach(async () => {
    const mine = await redis.keys(`${NAMESPACE}:${QUEUE}*`);
    if (mine.length > 0) {
      await redis.del(...mine);
    }
    queue = new Queue(QUEUE, { connection });
    await queue.obliterate({ force: true }).catch(() => undefined);
    adapter = new BullMQAdapter(queue);
    store = new LatencyStore({ redis, retention: { minutes: 7, hours: 90, days: 90 } });
    // Margin 0 so a job that just finished is in range. The margin's own behaviour gets
    // its own test below rather than slowing every other case by five seconds.
    sampler = new LatencySampler({ redis, store, tickMs: 60_000, safetyMarginMs: 0 });
  });

  afterEach(async () => {
    await worker?.close();
    worker = undefined;
    await queue.obliterate({ force: true }).catch(() => undefined);
    await queue.close();
  });

  async function processJobs(count: number, durationMs: number): Promise<void> {
    // Close any worker from a previous call first. Two live workers on one queue race for
    // the new jobs, so the second worker's completion counter can never reach `count` and
    // the promise below hangs until jest times the test out.
    await worker?.close();
    worker = undefined;
    await queue.addBulk(Array.from({ length: count }, (_, i) => ({ name: 'job', data: { i } })));
    worker = new Worker(
      QUEUE,
      async () => {
        await new Promise((resolve) => setTimeout(resolve, durationMs));
      },
      { connection, concurrency: 4 }
    );
    await new Promise<void>((resolve) => {
      let done = 0;
      worker!.on('completed', () => {
        done += 1;
        if (done === count) {
          resolve();
        }
      });
    });
  }

  it('records a run-time sample per completed job', async () => {
    await processJobs(5, 30);
    await sampler.sample(adapter);

    const day = minuteToDay(Date.now() / 60000);
    const days = await store.readRange(adapter.getName(), 'runtime', 'day', [day]);
    expect(vectorTotal(days[day] ?? [])).toBe(5);
  });

  it('does not double count across two consecutive ticks', async () => {
    await processJobs(4, 20);
    await sampler.sample(adapter);
    await sampler.sample(adapter);

    const day = minuteToDay(Date.now() / 60000);
    const days = await store.readRange(adapter.getName(), 'runtime', 'day', [day]);
    expect(vectorTotal(days[day] ?? [])).toBe(4);
  });

  it('picks up jobs completed between two ticks without gaps', async () => {
    await processJobs(3, 20);
    await sampler.sample(adapter);
    await processJobs(2, 20);
    await sampler.sample(adapter);

    const day = minuteToDay(Date.now() / 60000);
    const days = await store.readRange(adapter.getName(), 'runtime', 'day', [day]);
    expect(vectorTotal(days[day] ?? [])).toBe(5);
  });

  it('defers a job that finished inside the safety margin to a later tick', async () => {
    // ZADD into the finished set and the scan are not atomic, so a scan must not claim the
    // very edge of now. With a wide margin nothing recent is in range yet.
    const guarded = new LatencySampler({
      redis,
      store,
      tickMs: 60_000,
      safetyMarginMs: 30_000,
    });
    await processJobs(3, 20);
    await guarded.sample(adapter);

    const day = minuteToDay(Date.now() / 60000);
    const days = await store.readRange(adapter.getName(), 'runtime', 'day', [day]);
    expect(vectorTotal(days[day] ?? [])).toBe(0);

    // Deferred, not lost: a sampler with no margin picks the same jobs up. The guarded
    // sampler released its lease when its scan finished, so nothing blocks this.
    await sampler.sample(adapter);
    const after = await store.readRange(adapter.getName(), 'runtime', 'day', [day]);
    expect(vectorTotal(after[day] ?? [])).toBe(3);
  });

  it('lets only one of two concurrent samplers write', async () => {
    await processJobs(4, 20);
    const other = new LatencySampler({ redis, store, tickMs: 60_000, safetyMarginMs: 0 });
    await Promise.all([sampler.sample(adapter), other.sample(adapter)]);

    const day = minuteToDay(Date.now() / 60000);
    const days = await store.readRange(adapter.getName(), 'runtime', 'day', [day]);
    expect(vectorTotal(days[day] ?? [])).toBe(4);
  });

  it('records queue age from the oldest waiting job', async () => {
    await queue.add('waiting', {});
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await sampler.sample(adapter);

    const day = minuteToDay(Date.now() / 60000);
    const ages = await store.readQueueAge(adapter.getName(), 'day', [day]);
    expect(ages[day]).toBeGreaterThanOrEqual(1000);
  });

  it('reports zero queue age when nothing is waiting', async () => {
    await sampler.sample(adapter);
    const day = minuteToDay(Date.now() / 60000);
    const ages = await store.readQueueAge(adapter.getName(), 'day', [day]);
    expect(ages[day]).toBe(0);
  });

  it('never throws when the queue does not exist', async () => {
    const missing = new Queue('NoSuchLatencyQueue', { connection });
    const missingAdapter = new BullMQAdapter(missing);
    await expect(sampler.sample(missingAdapter)).resolves.toBeUndefined();
    await missing.close();
  });

  it('reports whether an adapter can be sampled', () => {
    expect(LatencySampler.supports(adapter)).toBe(true);
    expect(LatencySampler.supports({ getName: () => 'x' } as never)).toBe(false);
  });
});
