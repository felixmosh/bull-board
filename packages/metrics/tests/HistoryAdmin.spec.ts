import { Redis } from 'ioredis';
import { MetricsHistoryAdmin, parseHistoryKey } from '../src/HistoryAdmin';
import { HistoryStore } from '../src/HistoryStore';
import { GLOBAL_QUEUE, NAMESPACE, dayHashKey, minuteToDay, totalsHashKey } from '../src/keys';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: +(process.env.REDIS_PORT || 6379),
};

const DAY_ONE = Date.UTC(2021, 0, 1, 0, 5) / 60000;
const minuteOn = (offsetDays: number, offsetMinutes = 0) =>
  DAY_ONE + offsetDays * 1440 + offsetMinutes;
const dayOf = (offsetDays: number) => minuteToDay(minuteOn(offsetDays));

describe('MetricsHistoryAdmin', () => {
  let redis: Redis;
  let store: HistoryStore;
  let admin: MetricsHistoryAdmin;

  const clearNamespace = async () => {
    const keys = await redis.keys(`${NAMESPACE}:*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  };

  beforeEach(async () => {
    redis = new Redis(connection);
    store = new HistoryStore({ redis, retentionDays: 90 });
    admin = new MetricsHistoryAdmin({ connection: redis });
    await clearNamespace();
  });

  afterEach(async () => {
    await clearNamespace();
    await redis.quit();
  });

  describe('parseHistoryKey', () => {
    it('parses day and totals keys', () => {
      expect(parseHistoryKey(`${NAMESPACE}:Q:completed:2021-01-01`)).toEqual({
        queue: 'Q',
        metric: 'completed',
        day: '2021-01-01',
      });
      expect(parseHistoryKey(`${NAMESPACE}:Q:completed:totals`)).toEqual({
        queue: 'Q',
        metric: 'completed',
        day: null,
      });
    });

    it('parses from the right so queue names may contain colons', () => {
      expect(parseHistoryKey(`${NAMESPACE}:team:eu:mailer:failed:2021-01-01`)).toEqual({
        queue: 'team:eu:mailer',
        metric: 'failed',
        day: '2021-01-01',
      });
    });

    it('rejects keys outside the namespace or with an unexpected shape', () => {
      expect(parseHistoryKey('bull:mailer:id')).toBeNull();
      expect(parseHistoryKey(`${NAMESPACE}:Q:completed`)).toBeNull();
      expect(parseHistoryKey(`${NAMESPACE}:Q:completed:not-a-day`)).toBeNull();
      expect(parseHistoryKey(`${NAMESPACE}:Q:completed:2021-1-1`)).toBeNull();
      expect(parseHistoryKey(`${NAMESPACE}foo:Q:completed:totals`)).toBeNull();
    });
  });

  describe('stats', () => {
    it('reports an empty namespace as zero', async () => {
      await expect(admin.stats()).resolves.toEqual({
        keys: 0,
        bytes: 0,
        minutes: 0,
        oldestDay: null,
        newestDay: null,
        queues: [],
      });
    });

    it('reports per-queue keys, minutes, days and a non-zero byte total', async () => {
      await store.upsertMinute('Q', 'completed', minuteOn(0), 3);
      await store.upsertMinute('Q', 'completed', minuteOn(0, 1), 4);
      await store.upsertMinute('Q', 'failed', minuteOn(1), 1);
      await store.upsertMinute('Q2', 'completed', minuteOn(0), 5);

      const stats = await admin.stats();
      const byName = Object.fromEntries(stats.queues.map((q) => [q.queue, q]));

      // Q: 2 day hashes (completed d0, failed d1) + 2 totals hashes.
      expect(byName['Q'].keys).toBe(4);
      expect(byName['Q'].minutes).toBe(3);
      expect(byName['Q'].days).toEqual([dayOf(0), dayOf(1)]);
      expect(byName['Q2'].minutes).toBe(1);
      expect(byName[GLOBAL_QUEUE].minutes).toBe(3);

      expect(stats.keys).toBe(byName['Q'].keys + byName['Q2'].keys + byName[GLOBAL_QUEUE].keys);
      expect(stats.minutes).toBe(7);
      expect(stats.bytes).toBeGreaterThan(0);
      expect(stats.oldestDay).toBe(dayOf(0));
      expect(stats.newestDay).toBe(dayOf(1));
    });

    it('ignores foreign keys that happen to sit in the namespace', async () => {
      await redis.set(`${NAMESPACE}:stray`, '1');
      await store.upsertMinute('Q', 'completed', minuteOn(0), 3);

      const stats = await admin.stats();

      expect(stats.queues.map((q) => q.queue).sort()).toEqual(['Q', GLOBAL_QUEUE]);
      expect(await redis.get(`${NAMESPACE}:stray`)).toBe('1');
    });

    it('sorts queues by footprint, largest first', async () => {
      for (let i = 0; i < 40; i++) {
        await store.upsertMinute('big', 'completed', minuteOn(0, i), i + 1);
      }
      await store.upsertMinute('small', 'completed', minuteOn(0), 1);

      const stats = await admin.stats();
      const names = stats.queues.map((q) => q.queue);

      expect(names.indexOf('big')).toBeLessThan(names.indexOf('small'));
    });
  });

  describe('purge', () => {
    it('removes everything in the namespace and nothing else', async () => {
      await redis.set('bull:mailer:1', 'job-payload');
      await redis.set('unrelated', 'keep-me');
      await store.upsertMinute('Q', 'completed', minuteOn(0), 3);
      await store.upsertMinute('Q2', 'failed', minuteOn(1), 2);

      const result = await admin.purge();

      expect(result.keysDeleted).toBeGreaterThan(0);
      expect(await redis.keys(`${NAMESPACE}:*`)).toEqual([]);
      expect(await redis.get('bull:mailer:1')).toBe('job-payload');
      expect(await redis.get('unrelated')).toBe('keep-me');

      await redis.del('bull:mailer:1', 'unrelated');
    });

    it('is a safe no-op on an empty namespace', async () => {
      await expect(admin.purge()).resolves.toEqual({ keysDeleted: 0, fieldsDeleted: 0 });
    });

    it('is a no-op for a queue that was never recorded', async () => {
      await store.upsertMinute('Q', 'completed', minuteOn(0), 3);

      await expect(admin.purge({ queue: 'nope' })).resolves.toEqual({
        keysDeleted: 0,
        fieldsDeleted: 0,
      });
      expect(await redis.hget(totalsHashKey('Q', 'completed'), dayOf(0))).toBe('3');
    });

    it('purging one queue leaves the other queues intact', async () => {
      await store.upsertMinute('Q', 'completed', minuteOn(0), 3);
      await store.upsertMinute('Q2', 'completed', minuteOn(0), 5);

      await admin.purge({ queue: 'Q' });

      expect(await redis.exists(dayHashKey('Q', 'completed', dayOf(0)))).toBe(0);
      expect(await redis.exists(totalsHashKey('Q', 'completed'))).toBe(0);
      expect(await redis.hget(totalsHashKey('Q2', 'completed'), dayOf(0))).toBe('5');
    });

    it('subtracts the purged queue from the global rollup', async () => {
      await store.upsertMinute('Q', 'completed', minuteOn(0), 3);
      await store.upsertMinute('Q2', 'completed', minuteOn(0), 5);

      await admin.purge({ queue: 'Q' });

      expect(
        await redis.hget(dayHashKey(GLOBAL_QUEUE, 'completed', dayOf(0)), String(minuteOn(0)))
      ).toBe('5');
      expect(await redis.hget(totalsHashKey(GLOBAL_QUEUE, 'completed'), dayOf(0))).toBe('5');
    });

    it('purging the last queue drains the global rollup instead of leaving zeros', async () => {
      await store.upsertMinute('Q', 'completed', minuteOn(0), 3);

      await admin.purge({ queue: 'Q' });

      expect(await redis.exists(dayHashKey(GLOBAL_QUEUE, 'completed', dayOf(0)))).toBe(0);
      expect(await redis.hexists(totalsHashKey(GLOBAL_QUEUE, 'completed'), dayOf(0))).toBe(0);
    });

    it('corrects the global totals even when the queue day hash is already gone', async () => {
      await store.upsertMinute('Q', 'completed', minuteOn(0), 3);
      await store.upsertMinute('Q2', 'completed', minuteOn(0), 5);
      // Simulate the day hash having expired while the daily rollup is still in retention.
      await redis.del(dayHashKey('Q', 'completed', dayOf(0)));

      await admin.purge({ queue: 'Q' });

      expect(await redis.hget(totalsHashKey(GLOBAL_QUEUE, 'completed'), dayOf(0))).toBe('5');
    });

    it('drops only days before the cutoff', async () => {
      await store.upsertMinute('Q', 'completed', minuteOn(0), 3);
      await store.upsertMinute('Q', 'completed', minuteOn(1), 4);
      await store.upsertMinute('Q', 'completed', minuteOn(2), 5);

      const result = await admin.purge({ before: dayOf(2) });

      expect(await redis.exists(dayHashKey('Q', 'completed', dayOf(0)))).toBe(0);
      expect(await redis.exists(dayHashKey('Q', 'completed', dayOf(1)))).toBe(0);
      expect(await redis.exists(dayHashKey('Q', 'completed', dayOf(2)))).toBe(1);
      expect(await redis.hkeys(totalsHashKey('Q', 'completed'))).toEqual([dayOf(2)]);
      expect(result.keysDeleted).toBeGreaterThan(0);
      expect(result.fieldsDeleted).toBeGreaterThan(0);
    });

    it('accepts a Date cutoff', async () => {
      await store.upsertMinute('Q', 'completed', minuteOn(0), 3);
      await store.upsertMinute('Q', 'completed', minuteOn(5), 4);

      await admin.purge({ before: new Date(minuteOn(5) * 60000) });

      expect(await redis.hkeys(totalsHashKey('Q', 'completed'))).toEqual([dayOf(5)]);
    });

    it('rejects a malformed day cutoff instead of purging the wrong range', async () => {
      await store.upsertMinute('Q', 'completed', minuteOn(0), 3);

      await expect(admin.purge({ before: '01/01/2021' })).rejects.toThrow(/YYYY-MM-DD/);
      expect(await redis.exists(dayHashKey('Q', 'completed', dayOf(0)))).toBe(1);
    });

    it('combines queue and cutoff, correcting the global rollup for the dropped days only', async () => {
      await store.upsertMinute('Q', 'completed', minuteOn(0), 3);
      await store.upsertMinute('Q', 'completed', minuteOn(1), 4);
      await store.upsertMinute('Q2', 'completed', minuteOn(0), 5);

      await admin.purge({ queue: 'Q', before: dayOf(1) });

      expect(await redis.hkeys(totalsHashKey('Q', 'completed'))).toEqual([dayOf(1)]);
      // Day 0 loses Q's 3 and keeps Q2's 5; day 1 is untouched.
      expect(await redis.hget(totalsHashKey(GLOBAL_QUEUE, 'completed'), dayOf(0))).toBe('5');
      expect(await redis.hget(totalsHashKey(GLOBAL_QUEUE, 'completed'), dayOf(1))).toBe('4');
    });

    it('handles queue names containing colons', async () => {
      await store.upsertMinute('team:eu:mailer', 'completed', minuteOn(0), 3);
      await store.upsertMinute('other', 'completed', minuteOn(0), 5);

      await admin.purge({ queue: 'team:eu:mailer' });

      expect(await redis.exists(totalsHashKey('team:eu:mailer', 'completed'))).toBe(0);
      expect(await redis.hget(totalsHashKey('other', 'completed'), dayOf(0))).toBe('5');
      expect(await redis.hget(totalsHashKey(GLOBAL_QUEUE, 'completed'), dayOf(0))).toBe('5');
    });

    it('treats a glob-looking queue name literally', async () => {
      await store.upsertMinute('Q*', 'completed', minuteOn(0), 3);
      await store.upsertMinute('Q1', 'completed', minuteOn(0), 5);

      await admin.purge({ queue: 'Q*' });

      expect(await redis.exists(totalsHashKey('Q*', 'completed'))).toBe(0);
      expect(await redis.hget(totalsHashKey('Q1', 'completed'), dayOf(0))).toBe('5');
    });

    it('is idempotent: purging twice changes nothing the second time', async () => {
      await store.upsertMinute('Q', 'completed', minuteOn(0), 3);

      const first = await admin.purge({ queue: 'Q' });
      const second = await admin.purge({ queue: 'Q' });

      expect(first.keysDeleted).toBeGreaterThan(0);
      expect(second).toEqual({ keysDeleted: 0, fieldsDeleted: 0 });
    });

    it('leaves the recorder able to keep writing afterwards', async () => {
      await store.upsertMinute('Q', 'completed', minuteOn(0), 3);
      await admin.purge();

      await store.upsertMinute('Q', 'completed', minuteOn(0), 3);

      expect(await redis.hget(totalsHashKey('Q', 'completed'), dayOf(0))).toBe('3');
      expect(await redis.hget(totalsHashKey(GLOBAL_QUEUE, 'completed'), dayOf(0))).toBe('3');
    });

    it('purges a backlog spanning more than one HDEL batch', async () => {
      const backlog: Record<string, string> = {};
      for (let i = 0; i < 400; i++) {
        backlog[dayOf(-500 + i)] = '1';
      }
      await redis.hset(totalsHashKey('Q', 'completed'), backlog);

      const result = await admin.purge({ before: dayOf(0) });

      expect(result.fieldsDeleted).toBe(400);
      expect(await redis.exists(totalsHashKey('Q', 'completed'))).toBe(0);
    });
  });

  describe('connection ownership', () => {
    it('does not close a caller-supplied connection', async () => {
      const owned = new MetricsHistoryAdmin({ connection: redis });

      owned.disconnect();

      await expect(redis.ping()).resolves.toBe('PONG');
    });

    it('closes a connection it opened itself', async () => {
      const owned = new MetricsHistoryAdmin({ connection });
      await owned.stats();

      owned.disconnect();

      await expect(owned.stats()).rejects.toThrow();
    });
  });
});
