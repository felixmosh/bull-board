import { createBullBoard } from '@bull-board/api';
import { ExpressAdapter } from '@bull-board/express';
import { Redis } from 'ioredis';
import type { CliConfig } from './config/types';
import { maskRedisUrl, RETRY_INTERVAL_MS, type ConnectionState } from './connectionState';
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

/** A dead Redis connection can leave `maxRetriesPerRequest: null` commands queued forever
 * (BullMQ/Bull `close()`, ioredis `quit()` alike), which would otherwise make Ctrl-C during
 * an outage hang until SIGKILL. Every close step during shutdown is bounded by this instead
 * of trusted to resolve on its own. */
const SHUTDOWN_GRACE_MS = 3000;

function raceTimeout(ms: number): { promise: Promise<'timeout'>; cancel: () => void } {
  let timer: NodeJS.Timeout;
  const promise = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), ms);
    timer.unref();
  });

  return { promise, cancel: () => clearTimeout(timer) };
}

async function closeWithGrace(
  promise: Promise<unknown>,
  ms: number,
  onTimeout: () => void
): Promise<void> {
  const timeout = raceTimeout(ms);
  const outcome = await Promise.race([
    promise.then(
      () => 'done' as const,
      () => 'done' as const
    ),
    timeout.promise,
  ]);
  timeout.cancel();
  if (outcome === 'timeout') onTimeout();
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
  // cause of the very first `connect()` call: ioredis's `connect()` rejects with the generic
  // "Connection is closed.", not the underlying ECONNREFUSED/ENOTFOUND/etc., which instead
  // arrives here first. `??=` means only that first attempt's error survives in this
  // variable; every attempt after it is read directly off its own `error` event instead (see
  // the `client.on('error', ...)` below), so nothing here needs resetting between attempts.
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
  // interval (a large keyspace can exceed it) can never overlap with the next one. Guarded
  // against `rescanTimer` already being set so two overlapping callers (a `ready` event
  // landing while another one's `becomeConnected()` is still finishing its own scan) cannot
  // each start their own self-rescheduling loop, leaving the timer variable tracking only
  // the last one and orphaning the other to run forever.
  const scheduleRescan = () => {
    if (closing || config.scanInterval <= 0 || rescanTimer) return;

    rescanTimer = setTimeout(() => {
      rescanTimer = undefined;
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
      await closeWithGrace(server.close(), SHUTDOWN_GRACE_MS, () => {
        log.warn(
          `Closing the HTTP server did not finish within ${SHUTDOWN_GRACE_MS}ms; forcing remaining connections closed.`
        );
        server.closeAllConnections();
      });
      await closeWithGrace(registry.close(), SHUTDOWN_GRACE_MS, () =>
        log.warn(
          `Closing queues did not finish within ${SHUTDOWN_GRACE_MS}ms; continuing shutdown.`
        )
      );
      await closeWithGrace(queues.close(), SHUTDOWN_GRACE_MS, () =>
        log.warn(
          `Closing shared Redis connections did not finish within ${SHUTDOWN_GRACE_MS}ms; continuing shutdown.`
        )
      );
      await closeWithGrace(client.quit(), SHUTDOWN_GRACE_MS, () => client.disconnect());
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
  let state: ConnectionState = {
    status: 'connecting',
    redisUrl: maskRedisUrl(config.redisUrl),
    attempts: 0,
  };
  const getState = () => state;

  const server = await startServer(config, { serverAdapter, getConnectionState: getState });

  const close = async () => {
    closing = true;
    if (rescanTimer) clearTimeout(rescanTimer);
    await closeWithGrace(server.close(), SHUTDOWN_GRACE_MS, () => {
      log.warn(
        `Closing the HTTP server did not finish within ${SHUTDOWN_GRACE_MS}ms; forcing remaining connections closed.`
      );
      server.closeAllConnections();
    });
    await closeWithGrace(registry.close(), SHUTDOWN_GRACE_MS, () =>
      log.warn(`Closing queues did not finish within ${SHUTDOWN_GRACE_MS}ms; continuing shutdown.`)
    );
    await closeWithGrace(queues.close(), SHUTDOWN_GRACE_MS, () =>
      log.warn(
        `Closing shared Redis connections did not finish within ${SHUTDOWN_GRACE_MS}ms; continuing shutdown.`
      )
    );
    await closeWithGrace(client.quit(), SHUTDOWN_GRACE_MS, () => client.disconnect());
  };

  beforeReady?.(close);

  let everFailed = false;

  // A connection failure -- the initial one or, since this same function also handles a
  // later drop (see the `error` listener below), any later one too. Downgrading out of
  // `connected` here is what brings the diagnostic page back if Redis goes away after a
  // successful start, rather than leaving the dashboard serving HTML against a dead
  // connection and `/api/queues` hanging behind ioredis's offline queue.
  const markUnavailable = (message: string) => {
    if (closing) return;
    state = {
      status: 'unavailable',
      redisUrl: maskRedisUrl(config.redisUrl),
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

  // Split into two failure paths on purpose. A rejected `client.connect()` above is a
  // connection failure and goes through `markUnavailable`. A rejection in here happens
  // *after* the client already reached 'ready', so it is never a connectivity problem (a
  // plausible cause: an ACL-restricted user that can authenticate but not run SCAN) and must
  // not be reported as "Redis unavailable" -- that sends an operator chasing an outage that
  // never happened. It also must not just log and leave `state` wherever it was: with no
  // further `ready` (already ready) or `error` (nothing wrong at the connection level) event
  // ever coming, nothing would ever move `state` again, wedging the page on a stale
  // "connecting"/"attempt 0" forever. `degraded` carries the real error instead.
  //
  // Guarded against re-entry with `inFlight`: two `ready` events landing before the first
  // `scan()` finishes must not both run a full discovery scan and both call
  // `scheduleRescan()` -- the second caller instead awaits the first one's own promise.
  let inFlight: Promise<void> | undefined;

  const becomeConnected = (): Promise<void> => {
    if (closing || state.status === 'connected') return Promise.resolve();
    if (inFlight) return inFlight;

    inFlight = (async () => {
      try {
        const count = await scan();
        if (closing) return;
        state = {
          status: 'connected',
          redisUrl: maskRedisUrl(config.redisUrl),
          attempts: state.attempts,
        };
        scheduleRescan();
        // On the very first attempt this would just repeat what the banner below already
        // says; it earns its place once there was something to recover from.
        if (everFailed) log.log('Redis connected. The dashboard is live.');
        logIfIdle(count);
      } catch (error) {
        if (closing) return;
        const message = (error as Error).message;
        state = {
          status: 'degraded',
          redisUrl: maskRedisUrl(config.redisUrl),
          attempts: state.attempts,
          lastError: message,
        };
        log.warn(`Connected to Redis, but could not finish starting up: ${message}`);
      } finally {
        inFlight = undefined;
      }
    })();

    return inFlight;
  };

  try {
    await client.connect();
  } catch (error) {
    markUnavailable(describeError(attemptError ?? (error as Error)));
  }
  if (client.status === 'ready') {
    await becomeConnected();
  }

  // Registered only after the first attempt above has fully settled, so neither fires as
  // part of it -- only for whatever ioredis's own `retryStrategy` does next, whether that is
  // still finishing the first connection or reconnecting after a later drop. `becomeConnected`
  // never rejects (it catches its own failure into `degraded`), so no `.catch()` is needed
  // here to guard against an unhandled rejection.
  client.on('ready', () => {
    void becomeConnected();
  });
  client.on('error', (error: Error) => {
    markUnavailable(describeError(error));
  });

  log.log(`bull-board listening on ${server.url}`);
  log.log(`Redis:  ${config.redisUrl}`);
  log.log(`Prefix: ${config.prefixes.join(', ')}`);

  return { url: server.url, close };
}
