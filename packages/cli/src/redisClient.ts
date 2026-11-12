import { Cluster, Redis, type ClusterOptions } from 'ioredis';
import type { ConnectionConfig } from './config/connection';

export type RedisClient = Redis | Cluster;

export function isCluster(client: RedisClient): client is Cluster {
  return typeof (client as Partial<Cluster>).nodes === 'function';
}

/** SCAN carries no key, so a cluster client would answer from one arbitrary master. */
export function scanTargets(client: RedisClient): RedisClient[] {
  return isCluster(client) ? client.nodes('master') : [client];
}

const keepHostnameForTlsVerification: ClusterOptions['dnsLookup'] = (address, callback) =>
  callback(null, address);

export function createRedisClient(
  connection: ConnectionConfig,
  redisOptions: Record<string, unknown>,
  noRetry: boolean
): RedisClient {
  if (connection.mode === 'cluster') {
    const options: ClusterOptions = { lazyConnect: true, redisOptions };
    if (connection.options.tls) options.dnsLookup = keepHostnameForTlsVerification;
    if (noRetry) options.clusterRetryStrategy = () => null;

    return new Cluster(connection.nodes, options);
  }

  return connection.mode === 'url'
    ? new Redis(connection.url, redisOptions)
    : new Redis(redisOptions);
}
