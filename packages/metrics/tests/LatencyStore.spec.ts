import { Redis } from 'ioredis';
import { emptyVector } from '../src/histogram';
import { GLOBAL_QUEUE, NAMESPACE, minuteToDay, minuteToHour } from '../src/keys';
import { LatencyStore } from '../src/LatencyStore';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: +(process.env.REDIS_PORT || 6379),
  db: +(process.env.REDIS_TEST_DB || 15),
};

const QUEUE = 'LatencyStoreQueue';
// Own day, far from the other suites, because the global rollup is shared.
const BASE_MINUTE = Date.UTC(2019, 7, 1) / 60000;

describe('LatencyStore', () => {
  let redis: Redis;
  let store: LatencyStore;

  beforeAll(() => {
    redis = new Redis(connection);
    store = new LatencyStore({ redis, retention: { minutes: 7, hours: 90, days: 90 } });
  });

  afterAll(async () => {
    await redis.quit();
  });

  beforeEach(async () => {
    const mine = await redis.keys(`${NAMESPACE}:${QUEUE}*`);
    const globals = await redis.keys(`${NAMESPACE}:${GLOBAL_QUEUE}:*:2019-08-*`);
    if (mine.length + globals.length > 0) {
      await redis.del(...mine, ...globals);
    }
  });

  it('merges repeated samples into the same hour bucket', async () => {
    const hour = minuteToHour(BASE_MINUTE);
    const day = minuteToDay(BASE_MINUTE);
    const first = emptyVector();
    first[2] = 3;
    const second = emptyVector();
    second[2] = 4;
    second[5] = 1;

    await store.addSamples(QUEUE, 'runtime', hour, first);
    await store.addSamples(QUEUE, 'runtime', hour, second);

    const hours = await store.readRange(QUEUE, 'runtime', 'hour', [day]);
    expect(hours[String(hour)][2]).toBe(7);
    expect(hours[String(hour)][5]).toBe(1);
  });

  it('rolls the same samples into day totals and the global rollup', async () => {
    const hour = minuteToHour(BASE_MINUTE);
    const day = minuteToDay(BASE_MINUTE);
    const vector = emptyVector();
    vector[4] = 6;

    await store.addSamples(QUEUE, 'runtime', hour, vector);

    const days = await store.readRange(QUEUE, 'runtime', 'day', [day]);
    expect(days[day][4]).toBe(6);

    const globals = await store.readRange(GLOBAL_QUEUE, 'runtime', 'day', [day]);
    expect(globals[day][4]).toBe(6);
  });

  it('keeps runtime and waittime separate', async () => {
    const hour = minuteToHour(BASE_MINUTE);
    const day = minuteToDay(BASE_MINUTE);
    const run = emptyVector();
    run[1] = 2;
    const wait = emptyVector();
    wait[9] = 5;

    await store.addSamples(QUEUE, 'runtime', hour, run);
    await store.addSamples(QUEUE, 'waittime', hour, wait);

    const runDays = await store.readRange(QUEUE, 'runtime', 'day', [day]);
    const waitDays = await store.readRange(QUEUE, 'waittime', 'day', [day]);
    expect(runDays[day][1]).toBe(2);
    expect(runDays[day][9]).toBe(0);
    expect(waitDays[day][9]).toBe(5);
  });

  it('stores queue age as a max rather than a sum', async () => {
    const hour = minuteToHour(BASE_MINUTE);
    const day = minuteToDay(BASE_MINUTE);

    await store.recordQueueAge(QUEUE, hour, 5_000);
    await store.recordQueueAge(QUEUE, hour, 12_000);
    await store.recordQueueAge(QUEUE, hour, 3_000);

    const hours = await store.readQueueAge(QUEUE, 'hour', [day]);
    expect(hours[String(hour)]).toBe(12_000);

    const days = await store.readQueueAge(QUEUE, 'day', [day]);
    expect(days[day]).toBe(12_000);
  });

  it('returns nothing for a day that was never written', async () => {
    const hours = await store.readRange(QUEUE, 'runtime', 'hour', ['2019-08-28']);
    expect(hours).toEqual({});
  });

  it('applies a ttl to every key it writes', async () => {
    const hour = minuteToHour(BASE_MINUTE);
    const day = minuteToDay(BASE_MINUTE);
    const vector = emptyVector();
    vector[0] = 1;
    await store.addSamples(QUEUE, 'runtime', hour, vector);

    const hourTtl = await redis.ttl(`${NAMESPACE}:${QUEUE}:runtime:hour:${day}`);
    const totalsTtl = await redis.ttl(`${NAMESPACE}:${QUEUE}:runtime:totals`);
    expect(hourTtl).toBeGreaterThan(0);
    expect(totalsTtl).toBeGreaterThan(0);
  });
});
