import { BullAdapter } from '@bull-board/api/bullAdapter';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import type { QueueAdapterOptions } from '@bull-board/api/typings/app';
import BullQueue from 'bull';
import { Queue as BullMQQueue } from 'bullmq';
import type { Redis } from 'ioredis';
import { describeError } from './describeError';
import type { DiscoveredQueue } from './discovery';
import type { QueueHandle } from './registry';

export interface QueueFactoryDeps {
  client: Redis;
  readOnly: boolean;
  queueOptions: Record<string, Partial<QueueAdapterOptions>>;
  onWarning(message: string): void;
}

export interface QueueFactory {
  createQueue(discovered: DiscoveredQueue): QueueHandle;
  close(): Promise<void>;
}

export function createQueueFactory({
  client,
  readOnly,
  queueOptions,
  onWarning,
}: QueueFactoryDeps): QueueFactory {
  let bullSubscriber: Redis | undefined;

  function createQueue(discovered: DiscoveredQueue): QueueHandle {
    // QueueAdapterOptions.prefix is a display-name prefix, not the Redis key prefix.
    const options: Partial<QueueAdapterOptions> = {
      ...queueOptions[discovered.name],
      readOnlyMode: readOnly || queueOptions[discovered.name]?.readOnlyMode === true,
    };

    if (discovered.lib === 'bullmq') {
      const queue = new BullMQQueue(discovered.name, {
        connection: client,
        prefix: discovered.prefix,
        // The dashboard only reads the queues it discovers, so it must not write their meta hash.
        skipMetasUpdate: true,
      });
      queue.on('error', (error: Error) =>
        onWarning(`Queue "${discovered.name}" connection error: ${describeError(error)}`)
      );

      return {
        adapter: new BullMQAdapter(queue, options),
        close: () => queue.close(),
      };
    }

    const queue = new BullQueue(discovered.name, {
      prefix: discovered.prefix,
      createClient: (type) => {
        if (type === 'client') return client;
        // Bull rejects a subscriber that has enableReadyCheck or maxRetriesPerRequest set.
        if (!bullSubscriber) {
          bullSubscriber = client.duplicate({
            enableReadyCheck: false,
            maxRetriesPerRequest: null,
          });
        }

        return bullSubscriber;
      },
    });
    queue.on('error', (error: Error) =>
      onWarning(`Queue "${discovered.name}" connection error: ${describeError(error)}`)
    );

    return {
      adapter: new BullAdapter(queue, options),
      close: () => queue.close(),
    };
  }

  return {
    createQueue,
    close: async () => {
      await bullSubscriber?.quit();
      bullSubscriber = undefined;
    },
  };
}
