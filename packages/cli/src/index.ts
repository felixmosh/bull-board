import { createBullBoard } from '@bull-board/api';
import { ExpressAdapter } from '@bull-board/express';
import { Redis } from 'ioredis';
import type { CliConfig } from './config/types';
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

export async function run(config: CliConfig, log = console): Promise<RunningBoard> {
  const client = new Redis(config.redisUrl, { maxRetriesPerRequest: null, lazyConnect: true });
  // Without a listener here, ioredis prints its own "Unhandled error event" banner (with a
  // stack trace) for every failed connection attempt, including ones a caller already
  // handles below. Keeping the first error also recovers the real cause: ioredis's
  // `connect()` rejects with the generic "Connection is closed.", not the underlying
  // ECONNREFUSED/ENOTFOUND/etc.
  let firstError: Error | undefined;
  client.on('error', (error: Error) => {
    firstError ??= error;
    log.warn(`Redis connection error: ${error.message}`);
  });
  try {
    await client.connect();
  } catch (error) {
    throw new Error(
      `Could not connect to Redis at ${config.redisUrl}: ${(firstError ?? (error as Error)).message}`
    );
  }

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
  let timer: NodeJS.Timeout | undefined;

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

  // Self-rescheduled with setTimeout, rather than setInterval, so a scan that outruns the
  // interval (a large keyspace can exceed it) can never overlap with the next one.
  const scheduleRescan = () => {
    if (closing || config.scanInterval <= 0) return;

    timer = setTimeout(() => {
      scan()
        .catch((error) => log.warn(`Rescan failed: ${error.message}`))
        .finally(scheduleRescan);
    }, config.scanInterval * 1000);
    timer.unref();
  };

  const count = await scan();
  const server = await startServer(config, { serverAdapter });

  log.log(`bull-board listening on ${server.url}`);
  log.log(`Redis:  ${config.redisUrl}`);
  log.log(`Prefix: ${config.prefixes.join(', ')}`);
  if (count === 0) {
    log.log(
      `No queues found under ${config.prefixes.join(', ')} yet. ` +
        (config.scanInterval > 0 ? 'Watching for new ones.' : 'Scanning was set to run once.')
    );
  }

  scheduleRescan();

  return {
    url: server.url,
    close: async () => {
      closing = true;
      if (timer) clearTimeout(timer);
      await server.close();
      await registry.close();
      await queues.close();
      await client.quit();
    },
  };
}
