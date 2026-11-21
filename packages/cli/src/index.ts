import { createBullBoard } from '@bull-board/api';
import { ExpressAdapter } from '@bull-board/express';
import type { CliConfig } from './config/types';
import { RETRY_INTERVAL_MS, type ConnectionState } from './connectionState';
import { createRedisDatastore, type Datastore, type DatastoreDeps } from './datastore';
import { describeError } from './describeError';
import { createHistory, warnIfCountersUnavailable } from './history';
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

async function createDatastore(config: CliConfig, deps: DatastoreDeps): Promise<Datastore> {
  if (config.connection.mode !== 'postgres') return createRedisDatastore(config.connection, deps);

  const { createPostgresDatastore } = await import('./postgres');

  return createPostgresDatastore(config.connection.url, config.prefixes, deps);
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
  if (!isLoopbackHost(config.host) && !config.auth) {
    log.warn(
      `Warning: bull-board is listening on ${config.host}, which accepts connections from ` +
        'outside this machine, with no --user/--password set. Anyone who can reach it can ' +
        'view and modify every queue. Set --user and --password, or bind to 127.0.0.1.'
    );
  }

  const onWarning = (message: string) => log.warn(message);
  const datastore = await createDatastore(config, {
    readOnly: config.readOnly,
    queueOptions: config.queueOptions,
    noRetry: config.noRetry,
    onWarning,
  });
  const { name: storeName, label: storeLabel } = datastore;

  const { tls, sentinelTLS } =
    config.connection.mode === 'postgres' ? {} : config.connection.options;
  if (tls?.rejectUnauthorized === false || sentinelTLS?.rejectUnauthorized === false) {
    log.warn(
      'Warning: TLS certificate verification is off (--tls-insecure). The connection is ' +
        'encrypted, but anyone able to intercept it can impersonate Redis.'
    );
  }

  const history =
    config.history && datastore.redis
      ? createHistory({ client: datastore.redis, config: config.history, onWarning })
      : null;

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath(config.basePath);
  const board = createBullBoard({
    queues: [],
    serverAdapter,
    options: { uiConfig: config.uiConfig, historyProvider: history?.provider },
  });

  const registry = new QueueRegistry({
    board,
    createQueue: datastore.createQueue,
    onWarning,
    namespace: datastore.namespaceLabel.toLowerCase(),
  });

  let closing = false;
  let rescanTimer: NodeJS.Timeout | undefined;

  const scan = async () => {
    const discovered = await datastore.discover(config.prefixes, config.queueNames);

    if (closing) return discovered.length;

    await registry.sync(discovered);

    return discovered.length;
  };

  const startHistory = async () => {
    if (!history) return;

    history.start(() => registry.adapters());
    if (config.history?.record) {
      await warnIfCountersUnavailable(registry.adapters(), onWarning);
    } else {
      log.warn(
        'Historical metrics are served read-only: this process records nothing, so the charts ' +
          'show only what another process has already recorded.'
      );
    }
  };

  const logTarget = () => {
    const width = Math.max(storeName.length, datastore.namespaceLabel.length) + 2;
    log.log(`${`${storeName}:`.padEnd(width)}${storeLabel}`);
    log.log(`${`${datastore.namespaceLabel}:`.padEnd(width)}${config.prefixes.join(', ')}`);
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
        .catch((error) => log.warn(`Rescan of ${storeName} failed: ${describeError(error)}`))
        .finally(scheduleRescan);
    }, config.scanInterval * 1000);
    rescanTimer.unref();
  };

  if (config.noRetry) {
    try {
      await datastore.connect();
    } catch (error) {
      throw new Error(
        `Could not connect to ${storeName} at ${storeLabel}: ${describeError(error as Error)}`
      );
    }

    const count = await scan();
    await startHistory();
    const server = await startServer(config, { serverAdapter });

    const close = async () => {
      closing = true;
      history?.stop();
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
      await closeWithGrace(datastore.closeQueues(), SHUTDOWN_GRACE_MS, () =>
        log.warn(
          `Closing shared ${storeName} connections did not finish within ${SHUTDOWN_GRACE_MS}ms; continuing shutdown.`
        )
      );
      await closeWithGrace(datastore.quit(), SHUTDOWN_GRACE_MS, () => datastore.disconnect());
    };

    beforeReady?.(close);

    log.log(`bull-board listening on ${server.url}`);
    logTarget();
    logIfIdle(count);

    scheduleRescan();

    return { url: server.url, close };
  }

  let state: ConnectionState = {
    status: 'connecting',
    datastore: storeName,
    target: storeLabel,
    attempts: 0,
  };
  const getState = () => state;

  const server = await startServer(config, { serverAdapter, getConnectionState: getState });

  const close = async () => {
    closing = true;
    history?.stop();
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
    await closeWithGrace(datastore.closeQueues(), SHUTDOWN_GRACE_MS, () =>
      log.warn(
        `Closing shared ${storeName} connections did not finish within ${SHUTDOWN_GRACE_MS}ms; continuing shutdown.`
      )
    );
    await closeWithGrace(datastore.quit(), SHUTDOWN_GRACE_MS, () => datastore.disconnect());
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
        `Lost the ${storeName} connection: ${message}. Retrying every ${RETRY_INTERVAL_MS / 1000}s.`
      );
      return;
    }
    state = {
      status: 'unavailable',
      datastore: storeName,
      target: storeLabel,
      attempts: state.attempts + 1,
      lastError: message,
    };
    if (!everFailed) {
      everFailed = true;
      log.warn(`Could not connect to ${storeName} at ${storeLabel}: ${message}`);
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
          datastore: storeName,
          target: storeLabel,
          attempts: state.attempts,
        };
        scheduleRescan();
        await startHistory();
        if (everFailed) log.log(`${storeName} connected. The dashboard is live.`);
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
          datastore: storeName,
          target: storeLabel,
          attempts: state.attempts,
          lastError: message,
        };
        log.warn(`Connected to ${storeName}, but could not finish starting up: ${message}`);
      } finally {
        inFlight = undefined;
      }
    })();

    return inFlight;
  };

  try {
    await datastore.connect();
  } catch (error) {
    markUnavailable(describeError(error as Error));
  }
  if (datastore.isReady()) {
    await becomeConnected(true);
  }

  log.log(`bull-board listening on ${server.url}`);
  logTarget();
  if (deferredIdleCount !== undefined) logIfIdle(deferredIdleCount);

  datastore.onReady(() => {
    lostConnection = false;
    void becomeConnected();
  });
  datastore.onError((error: Error) => {
    markUnavailable(describeError(error));
  });

  return { url: server.url, close };
}
