import type { QueueAdapterOptions } from '@bull-board/api/typings/app';
import type { RedisConnectionConfig } from './config/connection';
import { describeConnection, RETRY_INTERVAL_MS, type DatastoreName } from './connectionState';
import { discoverQueues, probeQueues, type DiscoveredQueue } from './discovery';
import { createQueueFactory } from './queueFactory';
import { createRedisClient, type RedisClient } from './redisClient';
import type { QueueHandle } from './registry';

export interface Datastore {
  readonly name: DatastoreName;
  readonly label: string;
  readonly namespaceLabel: string;
  readonly redis?: RedisClient;
  connect(): Promise<void>;
  isReady(): boolean;
  onReady(listener: () => void): void;
  onError(listener: (error: Error) => void): void;
  discover(namespaces: string[], names: string[] | null): Promise<DiscoveredQueue[]>;
  createQueue(queue: DiscoveredQueue): QueueHandle | null;
  closeQueues(): Promise<void>;
  quit(): Promise<void>;
  disconnect(): void;
}

export interface DatastoreDeps {
  readOnly: boolean;
  queueOptions: Record<string, Partial<QueueAdapterOptions>>;
  noRetry: boolean;
  onWarning(message: string): void;
}

export function createRedisDatastore(
  connection: RedisConnectionConfig,
  { readOnly, queueOptions, noRetry, onWarning }: DatastoreDeps
): Datastore {
  const redisOptions = {
    maxRetriesPerRequest: null,
    lazyConnect: true,
    // ioredis retries unreachable sentinels forever, so --no-retry would hang in connect().
    ...(noRetry
      ? { sentinelRetryStrategy: () => null }
      : { retryStrategy: () => RETRY_INTERVAL_MS }),
    ...connection.options,
  };
  const client = createRedisClient(connection, redisOptions, noRetry);
  let attemptError: Error | undefined;
  client.on('error', (error: Error) => {
    attemptError ??= error;
  });
  // connect() can hang on sentinels, so the first error is what releases the diagnostic page.
  const firstError = new Promise<never>((_, reject) => client.once('error', reject));
  firstError.catch(() => undefined);

  const queues = createQueueFactory({ client, readOnly, queueOptions, onWarning });

  return {
    name: 'Redis',
    label: describeConnection(connection),
    namespaceLabel: 'Prefix',
    redis: client,
    async connect() {
      try {
        if (noRetry) {
          await client.connect();
          return;
        }
        const connecting = client.connect();
        connecting.catch(() => undefined);
        await Promise.race([connecting, firstError]);
      } catch (error) {
        throw attemptError ?? error;
      }
    },
    isReady: () => client.status === 'ready',
    onReady: (listener) => client.on('ready', listener),
    onError: (listener) => client.on('error', listener),
    async discover(prefixes, names) {
      if (!names) return discoverQueues(client, prefixes);

      return (
        await Promise.all(prefixes.map((prefix) => probeQueues(client, prefix, names)))
      ).flat();
    },
    createQueue: queues.createQueue,
    closeQueues: queues.close,
    quit: () => client.quit().then(() => undefined),
    disconnect: () => client.disconnect(),
  };
}
