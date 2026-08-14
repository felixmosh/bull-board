/** How often `run()` retries a failed Redis connection. Fixed, not exponential: a human is
 * watching the diagnostic page, and 3s is cheap enough not to bother backing off. */
export const RETRY_INTERVAL_MS = 3000;

export type ConnectionState =
  | { status: 'connecting'; redisUrl: string; attempts: number }
  | { status: 'connected'; redisUrl: string; attempts: number }
  | { status: 'unavailable'; redisUrl: string; attempts: number; lastError: string };
