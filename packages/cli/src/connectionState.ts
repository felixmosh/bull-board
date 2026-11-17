import type { ConnectionConfig } from './config/connection';

export const RETRY_INTERVAL_MS = 3000;

export type DatastoreName = 'Redis' | 'PostgreSQL';

interface Target {
  datastore: DatastoreName;
  target: string;
  attempts: number;
}

export type ConnectionState =
  | ({ status: 'connecting' } & Target)
  | ({ status: 'connected' } & Target)
  | ({ status: 'unavailable'; lastError: string } & Target)
  | ({ status: 'degraded'; lastError: string } & Target);

export function describeConnection(connection: ConnectionConfig): string {
  if (connection.mode === 'url' || connection.mode === 'postgres') return maskUrl(connection.url);

  if (connection.mode === 'cluster') {
    return `cluster://${connection.nodes.map(formatAddress).join(',')}`;
  }

  const { name, sentinels, host, port, path } = connection.options;
  if (sentinels) {
    const addresses = sentinels
      .map((sentinel) =>
        formatAddress({ host: sentinel.host ?? 'localhost', port: sentinel.port ?? 26379 })
      )
      .join(',');

    return `sentinel://${name}@${addresses}`;
  }

  return path ?? `redis://${host ?? 'localhost'}:${port ?? 6379}`;
}

function formatAddress({ host, port }: { host: string; port: number }): string {
  return `${host.includes(':') ? `[${host}]` : host}:${port}`;
}

export function maskUrl(url: string): string {
  if (url.startsWith('/')) return url;

  try {
    const parsed = new URL(url);
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

    return changed ? parsed.toString() : url;
  } catch {
    return url;
  }
}
