import type { Redis } from 'ioredis';
import { scanKeys } from './scan';

export interface DiscoveredQueue {
  prefix: string;
  name: string;
  lib: 'bull' | 'bullmq';
}

/**
 * Bull and BullMQ are told apart by key shape rather than by asking the library.
 * Bull's key list (`bull/lib/queue.js`) has `id` and `meta-paused` but no `meta`,
 * BullMQ writes `meta`. So `:meta` means BullMQ and a bare `:id` means Bull.
 */
const BULLMQ_MARKER = 'meta';
const BULL_MARKER = 'id';

/** Queue names may contain colons, so slice off the known prefix and suffix rather than splitting. */
function queueNameOf(key: string, prefix: string, marker: string): string | null {
  const head = `${prefix}:`;
  const tail = `:${marker}`;

  if (!key.startsWith(head) || !key.endsWith(tail)) return null;
  const name = key.slice(head.length, key.length - tail.length);

  return name.length > 0 ? name : null;
}

async function discoverInPrefix(
  client: Redis,
  prefix: string,
  found: Map<string, DiscoveredQueue>
): Promise<void> {
  const bullmqNames = new Set<string>();

  await scanKeys(client, `${prefix}:*:${BULLMQ_MARKER}`, (key) => {
    const name = queueNameOf(key, prefix, BULLMQ_MARKER);
    if (name) bullmqNames.add(name);
  });

  for (const name of bullmqNames) {
    found.set(`${prefix}:${name}`, { prefix, name, lib: 'bullmq' });
  }

  await scanKeys(client, `${prefix}:*:${BULL_MARKER}`, (key) => {
    const name = queueNameOf(key, prefix, BULL_MARKER);
    if (!name || bullmqNames.has(name)) return;
    found.set(`${prefix}:${name}`, { prefix, name, lib: 'bull' });
  });
}

export async function discoverQueues(
  client: Redis,
  prefixes: string[]
): Promise<DiscoveredQueue[]> {
  const found = new Map<string, DiscoveredQueue>();

  for (const prefix of prefixes) {
    // A wildcard prefix cannot be resolved without guessing where the prefix ends and the
    // queue name begins, since both may contain colons. Deferred, see the plan. Failing
    // loudly beats scanning `*:*:meta` and silently returning nothing.
    if (prefix.includes('*')) {
      throw new Error(
        `Wildcard prefixes are not supported yet: "${prefix}". List prefixes explicitly, ` +
          `for example --prefix bull,tenant-a`
      );
    }

    await discoverInPrefix(client, prefix, found);
  }

  return [...found.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, queue]) => queue);
}

/** Explicitly named queues skip the scan; only their library still has to be established. */
export async function probeQueues(
  client: Redis,
  prefix: string,
  names: string[]
): Promise<DiscoveredQueue[]> {
  return Promise.all(
    names.map(async (name) => {
      const isBullMQ = await client.exists(`${prefix}:${name}:${BULLMQ_MARKER}`);
      const isBull = isBullMQ ? 0 : await client.exists(`${prefix}:${name}:${BULL_MARKER}`);

      return { prefix, name, lib: isBull ? ('bull' as const) : ('bullmq' as const) };
    })
  );
}
