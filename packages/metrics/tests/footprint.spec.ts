import { Redis } from 'ioredis';
import { MetricsHistoryAdmin } from '../src/HistoryAdmin';
import { HistoryStore } from '../src/HistoryStore';
import { GLOBAL_QUEUE, NAMESPACE } from '../src/keys';

// Pinned to a throwaway logical database. This spec clears and purges the whole
// `bull-board:metrics:` namespace, which on the default db would delete a developer's
// running dev-board history along with it.
const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: +(process.env.REDIS_PORT || 6379),
  db: +(process.env.REDIS_TEST_DB || 15),
};

const MINUTES_PER_DAY = 1440;
const KB = 1024;

/**
 * Pins the storage-sizing claims the docs make, measured through the real write path
 * rather than asserted from arithmetic.
 *
 * Absolute byte counts depend on the Redis build and on `hash-max-listpack-entries`, so
 * exact figures would be flaky across environments. What is asserted instead are the
 * properties the guidance actually rests on: a full day of minute detail lands in a known
 * band, the coarser tiers are smaller by orders of magnitude, and idle time is free. The
 * measured numbers are printed so they can be compared against the documented table.
 */
describe('storage footprint', () => {
  let redis: Redis;
  let admin: MetricsHistoryAdmin;

  // Own queue namespace and a day far from the other suites, since the global rollup is
  // shared across every spec running against this Redis.
  const QUEUE = 'FootprintQueue';
  const BASE_MINUTE = Date.UTC(2019, 5, 1) / 60000;

  const store = () => new HistoryStore({ redis, retention: { minutes: 90, hours: 90, days: 90 } });

  async function clear(): Promise<void> {
    const mine = await redis.keys(`${NAMESPACE}:${QUEUE}*`);
    const globals = await redis.keys(`${NAMESPACE}:${GLOBAL_QUEUE}:*:2019-06-*`);
    if (mine.length + globals.length > 0) {
      await redis.del(...mine, ...globals);
    }
  }

  /** Writes `activeMinutes` non-zero buckets into a single day and returns that queue's stats. */
  async function writeDay(queue: string, dayOffset: number, activeMinutes: number) {
    const s = store();
    const start = BASE_MINUTE + dayOffset * MINUTES_PER_DAY;
    for (let i = 0; i < activeMinutes; i++) {
      await s.upsertMinute(queue, 'completed', start + i, (i % 50) + 1);
    }
    const stats = await admin.stats();
    return stats.queues.find((q) => q.queue === queue)!;
  }

  beforeEach(async () => {
    redis = new Redis(connection);
    admin = new MetricsHistoryAdmin({ connection: redis });
    await clear();
  });

  afterEach(async () => {
    await clear();
    await redis.quit();
  });

  it('a fully busy day costs what the sizing table claims', async () => {
    const stats = await writeDay(QUEUE, 0, MINUTES_PER_DAY);

    const minuteBytes = stats.tiers.minute.bytes;
    const hourBytes = stats.tiers.hour.bytes;
    const dayBytes = stats.tiers.day.bytes;

    // eslint-disable-next-line no-console
    console.log(
      `[footprint] busy day, one queue, one metric: ` +
        `minute ${(minuteBytes / KB).toFixed(1)}KB, ` +
        `hour ${(hourBytes / KB).toFixed(1)}KB, ` +
        `day ${(dayBytes / KB).toFixed(1)}KB`
    );

    expect(stats.minutes).toBe(MINUTES_PER_DAY);
    // Documented as ~83KB. The band tolerates listpack-vs-hashtable encoding differences
    // without letting a real regression (say, storing timestamps as strings) slip through.
    expect(minuteBytes).toBeGreaterThan(20 * KB);
    expect(minuteBytes).toBeLessThan(200 * KB);
    // The claim that makes short minute retention worthwhile: the rollups are negligible.
    expect(hourBytes * 50).toBeLessThan(minuteBytes);
    expect(dayBytes * 50).toBeLessThan(minuteBytes);
  });

  it('idle minutes cost nothing, so the footprint tracks activity and not uptime', async () => {
    const busy = await writeDay(QUEUE, 0, MINUTES_PER_DAY);
    const busyBytes = busy.tiers.minute.bytes;
    await clear();

    const sparse = await writeDay(QUEUE, 0, 144);

    // eslint-disable-next-line no-console
    console.log(
      `[footprint] 10% busy day: minute ${(sparse.tiers.minute.bytes / KB).toFixed(1)}KB ` +
        `vs ${(busyBytes / KB).toFixed(1)}KB fully busy`
    );

    expect(sparse.minutes).toBe(144);
    // A tenth of the activity must cost well under a quarter of the bytes. It is not
    // exactly a tenth: small hashes use a compact encoding, which works in our favour.
    expect(sparse.tiers.minute.bytes * 4).toBeLessThan(busyBytes);
  });

  it('a long daily-totals window stays negligible', async () => {
    const s = store();
    // One active minute on each of 90 consecutive days: 90 entries in the totals hash.
    for (let d = 0; d < 90; d++) {
      await s.upsertMinute(QUEUE, 'completed', BASE_MINUTE + d * MINUTES_PER_DAY, 5);
    }

    const stats = (await admin.stats()).queues.find((q) => q.queue === QUEUE)!;

    // eslint-disable-next-line no-console
    console.log(
      `[footprint] 90 days of daily totals: ${(stats.tiers.day.bytes / KB).toFixed(1)}KB`
    );

    expect(stats.tiers.day.keys).toBe(1);
    expect(stats.tiers.day.bytes).toBeLessThan(10 * KB);
  });

  it('the default tiering is what makes the difference, not a smaller window', async () => {
    // Same 3 days of fully busy traffic under two retentions. Retention is enforced by
    // TTL, which a test can't fast-forward, so this asserts the structural claim instead:
    // the minute tier is where essentially all the bytes are, which is why shortening
    // only that tier is what shrinks the footprint.
    const s = store();
    for (let d = 0; d < 3; d++) {
      for (let i = 0; i < 240; i++) {
        await s.upsertMinute(QUEUE, 'completed', BASE_MINUTE + d * MINUTES_PER_DAY + i, 3);
      }
    }

    const stats = (await admin.stats()).queues.find((q) => q.queue === QUEUE)!;
    const rollups = stats.tiers.hour.bytes + stats.tiers.day.bytes;

    // eslint-disable-next-line no-console
    console.log(
      `[footprint] 3 busy days: minute ${(stats.tiers.minute.bytes / KB).toFixed(1)}KB, ` +
        `rollups ${(rollups / KB).toFixed(1)}KB ` +
        `(${((rollups / stats.bytes) * 100).toFixed(1)}% of total)`
    );

    expect(stats.tiers.minute.keys).toBe(3);
    expect(rollups).toBeLessThan(stats.bytes * 0.25);
  });

  it('purging reclaims essentially all of it', async () => {
    await writeDay(QUEUE, 0, MINUTES_PER_DAY);

    const before = await admin.stats();
    await admin.purge({ queue: QUEUE });
    const after = await admin.stats();

    expect(before.queues.find((q) => q.queue === QUEUE)!.bytes).toBeGreaterThan(20 * KB);
    expect(after.queues.find((q) => q.queue === QUEUE)).toBeUndefined();
  });
});
