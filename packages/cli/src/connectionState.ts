export const RETRY_INTERVAL_MS = 3000;

export type ConnectionState =
  | { status: 'connecting'; redisUrl: string; attempts: number }
  | { status: 'connected'; redisUrl: string; attempts: number }
  | { status: 'unavailable'; redisUrl: string; attempts: number; lastError: string }
  | { status: 'degraded'; redisUrl: string; attempts: number; lastError: string };

export function maskRedisUrl(redisUrl: string): string {
  if (redisUrl.startsWith('/')) return redisUrl;

  try {
    const parsed = new URL(redisUrl);
    let changed = false;

    if (parsed.password) {
      parsed.password = '***';
      changed = true;
    }

    for (const key of ['password', 'auth']) {
      if (parsed.searchParams.has(key)) {
        parsed.searchParams.set(key, '***');
        changed = true;
      }
    }

    return changed ? parsed.toString() : redisUrl;
  } catch {
    return redisUrl;
  }
}
