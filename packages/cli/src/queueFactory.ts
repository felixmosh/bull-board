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

export function createQueueFactory({ client, readOnly, queueOptions }: QueueFactoryDeps) {
  // Bull opens its own connections per role. Reusing the shared client for reads and a
  // single duplicate for pub/sub keeps the connection count flat as queues are discovered.
  let bullSubscriber: Redis | undefined;

  return function createQueue(discovered: DiscoveredQueue): QueueHandle {
    const options: Partial<QueueAdapterOptions> = {
      prefix: discovered.prefix,
      ...queueOptions[discovered.name],
      readOnlyMode: readOnly || queueOptions[discovered.name]?.readOnlyMode === true,
    };

    if (discovered.lib === 'bullmq') {
      const queue = new BullMQQueue(discovered.name, {
        connection: client,
        prefix: discovered.prefix,
      });

      return {
        adapter: new BullMQAdapter(queue, options),
        close: () => queue.close(),
      };
    }

    const queue = new BullQueue(discovered.name, {
      prefix: discovered.prefix,
      createClient: (type) => {
        if (type === 'client') return client;
        if (!bullSubscriber) bullSubscriber = client.duplicate();

        return bullSubscriber;
      },
    });

    return {
      adapter: new BullAdapter(queue, options),
      close: () => queue.close(),
    };
  };
}
