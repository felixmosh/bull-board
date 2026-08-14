import type { Cluster, Redis } from 'ioredis';

export type RedisLike = Redis | Cluster;

/** A cluster only answers for its own slots, so every master has to be scanned. */
function scanTargets(client: RedisLike): Redis[] {
  const cluster = client as Cluster;

  return typeof cluster.nodes === 'function' ? cluster.nodes('master') : [client as Redis];
}

export async function scanKeys(
  client: RedisLike,
  pattern: string,
  onKey: (key: string) => void
): Promise<void> {
  for (const node of scanTargets(client)) {
    let cursor = '0';

    do {
      const [next, keys] = await node.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
      cursor = next;
      keys.forEach(onKey);
    } while (cursor !== '0');
  }
}
