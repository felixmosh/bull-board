import type { ConnectionConfig } from './config/connection';

export const RETRY_INTERVAL_MS = 3000;

export type ConnectionState =
  | { status: 'connecting'; redis: string; attempts: number }
  | { status: 'connected'; redis: string; attempts: number }
  | { status: 'unavailable'; redis: string; attempts: number; lastError: string }
  | { status: 'degraded'; redis: string; attempts: number; lastError: string };

export function describeConnection(connection: ConnectionConfig): string {
  if (connection.mode === 'url') return maskRedisUrl(connection.url);

  const { name, sentinels, host, port, path } = connection.options;
  if (sentinels) {
    const addresses = sentinels
      .map((sentinel) => {
        const host = sentinel.host ?? 'localhost';

        return `${host.includes(':') ? `[${host}]` : host}:${sentinel.port ?? 26379}`;
      })
      .join(',');

    return `sentinel://${name}@${addresses}`;
  }

  return path ?? `redis://${host ?? 'localhost'}:${port ?? 6379}`;
}

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
