import type { Redis } from 'ioredis';

export async function scanKeys(
  client: Redis,
  pattern: string,
  onKey: (key: string) => void
): Promise<void> {
  let cursor = '0';

  do {
    const [next, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
    cursor = next;
    keys.forEach(onKey);
  } while (cursor !== '0');
}
