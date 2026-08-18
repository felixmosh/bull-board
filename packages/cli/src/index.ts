import { createBullBoard } from '@bull-board/api';
import { ExpressAdapter } from '@bull-board/express';
import { Redis } from 'ioredis';
import type { CliConfig } from './config/types';
import { maskRedisUrl, RETRY_INTERVAL_MS, type ConnectionState } from './connectionState';
import { describeError } from './describeError';
import { discoverQueues, probeQueues } from './discovery';
import { createQueueFactory } from './queueFactory';
import { QueueRegistry } from './registry';
import { startServer } from './server';

export { describeError };

export interface RunningBoard {
  url: string;
  close(): Promise<void>;
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host);
}

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
    beforeReady?: (close: () => Promise<void>) => void;
  } = {}
): Promise<RunningBoard> {
  const client = new Redis(config.redisUrl, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
    ...(config.noRetry ? {} : { retryStrategy: () => RETRY_INTERVAL_MS }),
  });
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
    try {
      await client.connect();
    } catch (error) {
      throw new Error(
        `Could not connect to Redis at ${maskRedisUrl(config.redisUrl)}: ${describeError(attemptError ?? (error as Error))}`
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
    log.log(`Redis:  ${maskRedisUrl(config.redisUrl)}`);
    log.log(`Prefix: ${config.prefixes.join(', ')}`);
    logIfIdle(count);

    scheduleRescan();

    return { url: server.url, close };
  }

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

  let lostConnection = false;

  const markUnavailable = (message: string) => {
    if (closing) return;
    if (state.status === 'connected') {
      if (lostConnection) return;
      lostConnection = true;
      log.warn(
        `Lost the Redis connection: ${message}. Retrying every ${RETRY_INTERVAL_MS / 1000}s.`
      );
      return;
    }
    state = {
      status: 'unavailable',
      redisUrl: maskRedisUrl(config.redisUrl),
      attempts: state.attempts + 1,
      lastError: message,
    };
    if (!everFailed) {
      everFailed = true;
      log.warn(`Could not connect to Redis at ${maskRedisUrl(config.redisUrl)}: ${message}`);
      log.warn(
        `Serving a diagnostic page at ${server.url} and retrying every ` +
          `${RETRY_INTERVAL_MS / 1000}s. Pass --no-retry to exit instead of waiting.`
      );
    }
  };

  let inFlight: Promise<void> | undefined;

  let deferredIdleCount: number | undefined;

  const becomeConnected = (deferIdleLog = false): Promise<void> => {
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
        if (everFailed) log.log('Redis connected. The dashboard is live.');
        if (deferIdleLog) {
          deferredIdleCount = count;
        } else {
          logIfIdle(count);
        }
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
    await becomeConnected(true);
  }

  log.log(`bull-board listening on ${server.url}`);
  log.log(`Redis:  ${maskRedisUrl(config.redisUrl)}`);
  log.log(`Prefix: ${config.prefixes.join(', ')}`);
  if (deferredIdleCount !== undefined) logIfIdle(deferredIdleCount);

  client.on('ready', () => {
    lostConnection = false;
    void becomeConnected();
  });
  client.on('error', (error: Error) => {
    markUnavailable(describeError(error));
  });

  return { url: server.url, close };
}
