import { scanTargets, type RedisClient } from '../redisClient';

export async function scanKeys(
  client: RedisClient,
  pattern: string,
  onKey: (key: string) => void
): Promise<void> {
  for (const target of scanTargets(client)) {
    let cursor = '0';

    do {
      const [next, keys] = await target.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
      cursor = next;
      keys.forEach(onKey);
    } while (cursor !== '0');
  }
}
