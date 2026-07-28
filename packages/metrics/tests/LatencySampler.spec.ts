import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import * as histogram from '../src/histogram';
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

  it('records a wait-time sample per job that never retried', async () => {
    await processJobs(3, 20);
    await sampler.sample(adapter);

    const day = minuteToDay(Date.now() / 60000);
    const days = await store.readRange(adapter.getName(), 'waittime', 'day', [day]);
    expect(vectorTotal(days[day] ?? [])).toBe(3);
  });

  it('keeps a retried job out of the wait histogram but still times its run', async () => {
    // A retry's processedOn is the last attempt, so its wait would swallow the backoff and
    // drag p95 up. BullMQ 5 counts attempts in the `atm` hash field, not `attemptsMade`:
    // reading the old name makes every retried job look like a first attempt.
    await queue.add('retried', {}, { attempts: 2, backoff: { type: 'fixed', delay: 1500 } });
    let seen = 0;
    worker = new Worker(
      QUEUE,
      async () => {
        seen += 1;
        if (seen === 1) {
          throw new Error('first attempt fails');
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      },
      { connection }
    );
    await new Promise<void>((resolve) => {
      worker!.on('completed', () => resolve());
    });

    // The field really is `atm`, and really is above 1 by the time the job is sampled.
    const [jobId] = await queue.getCompleted().then((jobs) => jobs.map((job) => job.id));
    const fields = await redis.hmget(adapter.getQueueKey(String(jobId)), 'atm', 'attemptsMade');
    expect(fields).toEqual(['2', null]);

    await sampler.sample(adapter);

    const day = minuteToDay(Date.now() / 60000);
    const run = await store.readRange(adapter.getName(), 'runtime', 'day', [day]);
    const wait = await store.readRange(adapter.getName(), 'waittime', 'day', [day]);
    expect(vectorTotal(run[day] ?? [])).toBe(1);
    expect(vectorTotal(wait[day] ?? [])).toBe(0);
  });

  it('clamps a wait made negative by clock skew instead of dropping the sample', async () => {
    const job = await queue.add('skewed', {});
    worker = new Worker(QUEUE, async () => undefined, { connection });
    await new Promise<void>((resolve) => {
      worker!.on('completed', () => resolve());
    });

    // The producer's clock running ahead of the worker's is the real-world shape of this:
    // timestamp is stamped in one process and processedOn in another.
    const key = adapter.getQueueKey(String(job.id));
    const processedOn = Number(await redis.hget(key, 'processedOn'));
    await redis.hset(key, 'timestamp', String(processedOn + 5000));

    // bucketIndex maps every value <= 10ms, negative or not, to bucket 0, so asserting on
    // which bucket the sample lands in can't tell a clamped 0ms wait from an unclamped
    // -5000ms one: both land in the same bucket either way. Spy on bucketIndex instead to
    // see the actual duration the sampler computed, which is the thing the clamp changes.
    const bucketIndexSpy = jest.spyOn(histogram, 'bucketIndex');
    await sampler.sample(adapter);
    const observedDurations = bucketIndexSpy.mock.calls.map(([ms]) => ms);
    bucketIndexSpy.mockRestore();

    expect(Math.min(...observedDurations)).toBeGreaterThanOrEqual(0);

    const day = minuteToDay(Date.now() / 60000);
    const wait = await store.readRange(adapter.getName(), 'waittime', 'day', [day]);
    // The skewed sample is still counted, once, and lands at the bottom of the range.
    expect(vectorTotal(wait[day] ?? [])).toBe(1);
    expect((wait[day] ?? [])[0]).toBe(1);
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

  it('records queue age from a paused queue, whose backlog is not in the wait list', async () => {
    // Pausing RENAMEs wait to paused and routes new jobs there, so a sampler that only reads
    // wait reports a reassuring zero for a queue that is not draining at all.
    await queue.add('waiting', {});
    await queue.pause();
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(await redis.llen(adapter.getQueueKey('wait'))).toBe(0);
    expect(await redis.llen(adapter.getQueueKey('paused'))).toBe(1);

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
