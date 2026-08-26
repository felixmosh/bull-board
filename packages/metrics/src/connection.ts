import type { Redis, RedisOptions } from 'ioredis';

export type MetricsConnection = Redis | RedisOptions;

export function isRedisClient(connection: MetricsConnection): connection is Redis {
  return typeof (connection as Partial<Redis>)?.hgetall === 'function';
}
