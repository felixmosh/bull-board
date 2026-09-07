import { Cluster, Redis } from 'ioredis';
import type { ConnectionConfig } from './config/connection';

export type RedisClient = Redis | Cluster;

export function isCluster(client: RedisClient): client is Cluster {
  return typeof (client as Partial<Cluster>).nodes === 'function';
}

/** SCAN carries no key, so a cluster client would answer from one arbitrary master. */
export function scanTargets(client: RedisClient): RedisClient[] {
  return isCluster(client) ? client.nodes('master') : [client];
}

export function createRedisClient(
  connection: ConnectionConfig,
  redisOptions: Record<string, unknown>,
  noRetry: boolean
): RedisClient {
  if (connection.mode === 'cluster') {
    return new Cluster(connection.nodes, {
      lazyConnect: true,
      redisOptions,
      ...(noRetry ? { clusterRetryStrategy: () => null } : {}),
    });
  }

  return connection.mode === 'url'
    ? new Redis(connection.url, redisOptions)
    : new Redis(redisOptions);
}
