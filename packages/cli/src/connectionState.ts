/** How often `run()` retries a failed Redis connection. Fixed, not exponential: a human is
 * watching the diagnostic page, and 3s is cheap enough not to bother backing off. */
export const RETRY_INTERVAL_MS = 3000;

export type ConnectionState =
  | { status: 'connecting'; redisUrl: string; attempts: number }
  | { status: 'connected'; redisUrl: string; attempts: number }
  | { status: 'unavailable'; redisUrl: string; attempts: number; lastError: string }
  /** Reached Redis (a real connection, possibly authenticated) but something after that --
   * discovery, most likely -- failed for a reason that is not a connectivity problem, so
   * there is nothing for a connection retry to fix. Distinct from `unavailable` so the page
   * never promises a retry it is not going to make. */
  | { status: 'degraded'; redisUrl: string; attempts: number; lastError: string };

/** `state.redisUrl` is rendered into HTML and mirrored as JSON on an endpoint that -- unlike
 * the terminal -- can be reachable from outside the machine (`--host 0.0.0.0`, no auth). A
 * credential in the URL must not make that trip. A leading "/" is a unix socket path, which
 * `new URL()` rejects and which cannot carry a password anyway.
 *
 * ioredis (and this CLI's own config validation) also accepts the credential as a query
 * parameter -- `redis://host:port?password=secret` -- rather than userinfo, so both `password`
 * and `auth` search params are redacted alongside the userinfo password. */
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
