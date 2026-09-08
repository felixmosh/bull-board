import { Redis, type Cluster, type RedisOptions } from 'ioredis';

export type MetricsClient = Redis | Cluster;
export type MetricsConnection = MetricsClient | RedisOptions;

export function isClient(connection: MetricsConnection): connection is MetricsClient {
  return typeof (connection as Partial<Redis>)?.hgetall === 'function';
}

export function isCluster(connection: MetricsConnection): connection is Cluster {
  return typeof (connection as Partial<Cluster>)?.nodes === 'function';
}

export function scanTargets(client: MetricsClient): MetricsClient[] {
  return isCluster(client) ? client.nodes('master') : [client];
}

export function resolveClient(connection: MetricsConnection): {
  client: MetricsClient;
  owned: boolean;
} {
  if (isClient(connection)) {
    return { client: connection, owned: false };
  }
  // Default to RESP2 (ioredis v6 enables RESP3 by default). Keeps exact v5 wire parity and
  // support for Redis < 6.0, whose `HELLO 3` handshake fails. Spread order lets an explicit
  // caller `protocol` win. Only on the options path -- an injected client's protocol is its own.
  return { client: new Redis({ protocol: 2, ...connection }), owned: true };
}
