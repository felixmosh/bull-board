import { createBullBoard } from '@bull-board/api';
import { ExpressAdapter } from '@bull-board/express';
import { Redis } from 'ioredis';
import type { CliConfig } from './config/types';
import { RETRY_INTERVAL_MS, type ConnectionState } from './connectionState';
import { discoverQueues, probeQueues } from './discovery';
import { createQueueFactory } from './queueFactory';
import { QueueRegistry } from './registry';
import { startServer } from './server';

export interface RunningBoard {
  url: string;
  close(): Promise<void>;
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host);
}

/**
 * `error.message` is usually the whole story, but Node's own `net.connect` wraps a failed
 * dual-stack attempt (Happy Eyeballs, on by default since Node 20) in an `AggregateError`
 * whose own `.message` is empty; the real causes live in `.errors`. That combination is not
 * exotic: it is exactly what "redis://localhost:..." hits when nothing is listening, since
 * `localhost` resolves to both `::1` and `127.0.0.1` and both attempts get refused.
 */
export function describeError(error: Error): string {
  if (error.message) return error.message;
  const causes = (error as { errors?: unknown }).errors;

  return Array.isArray(causes) && causes.length > 0
    ? causes.map((cause) => (cause as Error).message).join('; ')
    : String(error);
}

export async function run(
  config: CliConfig,
  log = console,
  {
    beforeReady,
  }: {
    /**
     * Called with `close` once the server is listening but before anything is printed or a
     * rescan is scheduled. This is where a caller (`bin.ts`) arms SIGINT/SIGTERM handling:
     * doing it here, rather than after `run` returns, closes a real race where a signal
     * arriving between the "listening" banner and the caller registering its handlers had
     * nothing to catch it, and Node's default disposition killed the process outright
     * instead of running `close`.
     */
    beforeReady?: (close: () => Promise<void>) => void;
  } = {}
): Promise<RunningBoard> {
  const client = new Redis(config.redisUrl, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
    // ioredis already auto-reconnects on its own after any dropped or failed connection,
    // using a capped-backoff `retryStrategy` that is active by default. `--no-retry` leaves
    // that alone (the process exits on the first failure regardless). The default here
    // instead pins it to a flat, predictable cadence -- for the initial connection and any
    // later drop alike -- so there is exactly one thing driving reconnection, not that plus
    // a second, competing timer of our own calling `connect()` again: the two used to race,
    // and the loser was sometimes a fully healthy connection that this code never noticed.
    ...(config.noRetry ? {} : { retryStrategy: () => RETRY_INTERVAL_MS }),
  });
  // Without a listener here, ioredis prints its own "Unhandled error event" banner (with a
  // stack trace) for every failed connection attempt. Keeping it also recovers the real
  // cause: ioredis's `connect()` rejects with the generic "Connection is closed.", not the
  // underlying ECONNREFUSED/ENOTFOUND/etc. Reset before each attempt so a later retry's
  // error doesn't get shadowed by an earlier one.
  let attemptError: Error | undefined;
  client.on('error', (error: Error) => {
    attemptError ??= error;
  });

  if (!isLoopbackHost(config.host) && !config.auth) {
    log.warn(
      `Warning: bull-board is listening on ${config.host}, which accepts connections from ` +
        'outside this machine, with no --user/--password set. Anyone who can reach it can ' +
        'view and modify every queue. Set --user and --password, or bind to 127.0.0.1.'
    );
  }

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath(config.basePath);
  const board = createBullBoard({
    queues: [],
    serverAdapter,
    options: { uiConfig: config.uiConfig },
  });

  const onWarning = (message: string) => log.warn(message);
  const queues = createQueueFactory({
    client,
    readOnly: config.readOnly,
    queueOptions: config.queueOptions,
    onWarning,
  });
  const registry = new QueueRegistry({ board, createQueue: queues.createQueue, onWarning });

  // Checked before the reconciliation step (not just at the top of `scan`) so a scan that
  // was already mid-flight when `close()` ran does not sync a discovered set against a
  // registry/client that close() has since torn down.
  let closing = false;
  let rescanTimer: NodeJS.Timeout | undefined;

  const scan = async () => {
    const discovered = config.queueNames
      ? (
          await Promise.all(
            config.prefixes.map((prefix) => probeQueues(client, prefix, config.queueNames!))
          )
        ).flat()
      : await discoverQueues(client, config.prefixes);

    if (closing) return discovered.length;

    await registry.sync(discovered);

    return discovered.length;
  };

  const logIfIdle = (count: number) => {
    if (count === 0) {
      log.log(
        `No queues found under ${config.prefixes.join(', ')} yet. ` +
          (config.scanInterval > 0 ? 'Watching for new ones.' : 'Scanning was set to run once.')
      );
    }
  };

  // Self-rescheduled with setTimeout, rather than setInterval, so a scan that outruns the
  // interval (a large keyspace can exceed it) can never overlap with the next one.
  const scheduleRescan = () => {
    if (closing || config.scanInterval <= 0) return;

    rescanTimer = setTimeout(() => {
      scan()
        .catch((error) => log.warn(`Rescan failed: ${error.message}`))
        .finally(scheduleRescan);
    }, config.scanInterval * 1000);
    rescanTimer.unref();
  };

  if (config.noRetry) {
    // Exactly today's behaviour: connect before the server ever opens, so a failure here
    // means nothing is listening at all, not even a diagnostic page.
    try {
      await client.connect();
    } catch (error) {
      throw new Error(
        `Could not connect to Redis at ${config.redisUrl}: ${describeError(attemptError ?? (error as Error))}`
      );
    }

    const count = await scan();
    const server = await startServer(config, { serverAdapter });

    const close = async () => {
      closing = true;
      if (rescanTimer) clearTimeout(rescanTimer);
      await server.close();
      await registry.close();
      await queues.close();
      await client.quit();
    };

    beforeReady?.(close);

    log.log(`bull-board listening on ${server.url}`);
    log.log(`Redis:  ${config.redisUrl}`);
    log.log(`Prefix: ${config.prefixes.join(', ')}`);
    logIfIdle(count);

    scheduleRescan();

    return { url: server.url, close };
  }

  // The default: the server opens right away and, until Redis answers, serves a diagnostic
  // page in its place. The first attempt below is awaited before the "listening" banner
  // prints, so a caller watching for that banner (a script, a test, a human) never sees it
  // before the outcome of that attempt -- success or failure -- is already reflected in
  // `state`. Every attempt after that is entirely ioredis's own doing (its `retryStrategy`,
  // pinned to a flat cadence above); this code only reacts to `ready`/`error` as they land.
  let state: ConnectionState = { status: 'connecting', redisUrl: config.redisUrl, attempts: 0 };
  const getState = () => state;

  const server = await startServer(config, { serverAdapter, getConnectionState: getState });

  const close = async () => {
    closing = true;
    if (rescanTimer) clearTimeout(rescanTimer);
    await server.close();
    await registry.close();
    await queues.close();
    await client.quit();
  };

  beforeReady?.(close);

  let everFailed = false;

  const markUnavailable = (message: string) => {
    if (closing) return;
    state = {
      status: 'unavailable',
      redisUrl: config.redisUrl,
      attempts: state.attempts + 1,
      lastError: message,
    };
    if (!everFailed) {
      everFailed = true;
      log.warn(`Could not connect to Redis at ${config.redisUrl}: ${message}`);
      log.warn(
        `Serving a diagnostic page at ${server.url} and retrying every ` +
          `${RETRY_INTERVAL_MS / 1000}s. Pass --no-retry to exit instead of waiting.`
      );
    }
  };

  const becomeConnected = async () => {
    if (closing || state.status === 'connected') return;
    const count = await scan();
    if (closing) return;

    state = { status: 'connected', redisUrl: config.redisUrl, attempts: state.attempts };
    scheduleRescan();
    // On the very first attempt this would just repeat what the banner below already says;
    // it earns its place once there was something to recover from.
    if (everFailed) log.log('Redis connected. The dashboard is live.');
    logIfIdle(count);
  };

  try {
    await client.connect();
  } catch (error) {
    markUnavailable(describeError(attemptError ?? (error as Error)));
  }
  // Split from the block above on purpose: a failure here is not a connection failure (the
  // client just reached 'ready'), so it must not be reported as "Redis unavailable" -- that
  // would send an operator chasing a Redis outage that was never there.
  if (client.status === 'ready') {
    await becomeConnected().catch((error: Error) =>
      log.warn(`Setting up after connecting to Redis failed: ${error.message}`)
    );
  }

  // Registered only after the first attempt above has fully settled, so neither fires as
  // part of it -- only for whatever ioredis's own `retryStrategy` does next.
  client.on('ready', () => {
    becomeConnected().catch((error: Error) =>
      log.warn(`Setting up after reconnecting to Redis failed: ${error.message}`)
    );
  });
  client.on('error', (error: Error) => {
    if (state.status !== 'connected') markUnavailable(describeError(error));
  });

  log.log(`bull-board listening on ${server.url}`);
  log.log(`Redis:  ${config.redisUrl}`);
  log.log(`Prefix: ${config.prefixes.join(', ')}`);

  return { url: server.url, close };
}
