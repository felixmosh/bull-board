import { BullAdapter } from '@bull-board/api/bullAdapter';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import type { QueueAdapterOptions } from '@bull-board/api/typings/app';
import BullQueue from 'bull';
import { Queue as BullMQQueue } from 'bullmq';
import type { Redis } from 'ioredis';
import type { DiscoveredQueue } from './discovery';
import type { QueueHandle } from './registry';

export interface QueueFactoryDeps {
  client: Redis;
  readOnly: boolean;
  queueOptions: Record<string, Partial<QueueAdapterOptions>>;
}

export interface QueueFactory {
  createQueue(discovered: DiscoveredQueue): QueueHandle;
  /** Releases the Bull subscriber duplicate, which no individual queue owns. */
  close(): Promise<void>;
}

export function createQueueFactory({
  client,
  readOnly,
  queueOptions,
}: QueueFactoryDeps): QueueFactory {
  // Bull opens its own connections per role. Reusing the shared client for reads and a
  // single duplicate for pub/sub keeps the connection count flat as queues are discovered.
  let bullSubscriber: Redis | undefined;

  function createQueue(discovered: DiscoveredQueue): QueueHandle {
    // `QueueAdapterOptions.prefix` is a cosmetic display-name prefix (BaseAdapter#getName
    // concatenates it with the queue name), not the Redis key prefix; the Redis prefix is set
    // below via each queue constructor's own `prefix` option. Feeding `discovered.prefix` into
    // it here would prepend "bull" to every queue's displayed name under the default prefix.
    const options: Partial<QueueAdapterOptions> = {
      ...queueOptions[discovered.name],
      readOnlyMode: readOnly || queueOptions[discovered.name]?.readOnlyMode === true,
    };

    if (discovered.lib === 'bullmq') {
      const queue = new BullMQQueue(discovered.name, {
        connection: client,
        prefix: discovered.prefix,
        // The dashboard only reads queues it discovers; it doesn't own them, so it must not
        // write their `meta` hash as a side effect of construction. Without this, every scan
        // cycle re-fires an unawaited HSET on discovery/rediscovery, which also leaves that
        // write racing an immediate close during shutdown.
        skipMetasUpdate: true,
      });
      // BullMQ funnels every connection-layer problem (a dropped socket, a command that
      // outlives a closing connection, ...) through the queue's own 'error' event; Node throws
      // an unhandled exception for an 'error' event with no listener, which would otherwise
      // take the whole dashboard process down over an ordinary, transient Redis hiccup.
      queue.on('error', () => undefined);

      return {
        adapter: new BullMQAdapter(queue, options),
        close: () => queue.close(),
      };
    }

    const queue = new BullQueue(discovered.name, {
      prefix: discovered.prefix,
      createClient: (type) => {
        if (type === 'client') return client;
        // Bull rejects a subscriber connection that has `enableReadyCheck` or
        // `maxRetriesPerRequest` set (`bull/lib/queue.js`, MISSING_REDIS_OPTS), and
        // ioredis turns `enableReadyCheck` on by default, so the duplicate must override
        // both rather than inherit them from the shared client.
        if (!bullSubscriber) {
          bullSubscriber = client.duplicate({
            enableReadyCheck: false,
            maxRetriesPerRequest: null,
          });
        }

        return bullSubscriber;
      },
    });
    // Same reasoning as the BullMQ branch above: Bull emits 'error' for redis-connection
    // problems, and an unlistened 'error' event crashes the process.
    queue.on('error', () => undefined);

    return {
      adapter: new BullAdapter(queue, options),
      close: () => queue.close(),
    };
  }

  return {
    createQueue,
    close: async () => {
      // Bull never closes a connection handed to it through `createClient`, so the
      // subscriber duplicate is this factory's to release.
      await bullSubscriber?.quit();
      bullSubscriber = undefined;
    },
  };
}
