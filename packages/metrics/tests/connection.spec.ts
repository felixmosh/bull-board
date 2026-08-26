import { Redis } from 'ioredis';
import { isRedisClient } from '../src/connection';
import { MetricsHistoryAdmin } from '../src/HistoryAdmin';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: +(process.env.REDIS_PORT || 6379),
};

function clientFromASecondIoredisCopy(): Redis {
  return {
    hgetall: async () => ({}),
    pipeline: () => ({}),
    scanStream: () => ({}),
    disconnect: () => {},
  } as unknown as Redis;
}

describe('telling a client from connection options', () => {
  let real: Redis;

  beforeEach(() => {
    real = new Redis({ protocol: 2, ...connection, lazyConnect: true });
  });

  afterEach(() => {
    real.disconnect();
  });

  it('recognises a client whose Redis class is a different copy of ioredis', () => {
    const foreign = clientFromASecondIoredisCopy();

    expect(foreign instanceof Redis).toBe(false);
    expect(isRedisClient(foreign)).toBe(true);
  });

  it('recognises our own client', () => {
    expect(isRedisClient(real)).toBe(true);
  });

  it.each([
    ['host and port', connection],
    ['an empty object', {}],
    ['a url-less options bag', { db: 3, keyPrefix: 'x:' }],
  ])('treats %s as options rather than a client', (_label, options) => {
    expect(isRedisClient(options)).toBe(false);
  });

  it('adopts an injected client instead of opening a second connection to localhost', () => {
    const foreign = clientFromASecondIoredisCopy();

    const admin = new MetricsHistoryAdmin({ connection: foreign }) as unknown as {
      redis: Redis;
      ownsRedis: boolean;
    };

    expect(admin.redis).toBe(foreign);
    expect(admin.ownsRedis).toBe(false);
  });

  it('still builds and owns a client when given plain options', () => {
    const admin = new MetricsHistoryAdmin({
      connection: { ...connection, lazyConnect: true },
    }) as unknown as { redis: Redis; ownsRedis: boolean };

    expect(admin.ownsRedis).toBe(true);
    expect(admin.redis.options.port).toBe(connection.port);

    admin.redis.disconnect();
  });
});
