import type { BaseAdapter } from '@bull-board/api/baseAdapter';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import type { QueueAdapterOptions } from '@bull-board/api/typings/app';
import BullQueue from 'bull';
import { Queue as BullMQQueue } from 'bullmq';
import type { Redis } from 'ioredis';
import { describeError } from './describeError';
import type { DiscoveredQueue } from './discovery';
import { FailureEnricher, type FailureJob } from './notifications/details';
import { subscribeBull, subscribeBullMQ, type FailureListener } from './notifications/subscribe';
import { isCluster, type RedisClient } from './redisClient';
import type { QueueHandle } from './registry';

type BullRedisClient = ReturnType<NonNullable<BullQueue.QueueOptions['createClient']>>;
type BullMQConnection = NonNullable<ConstructorParameters<typeof BullMQQueue>[1]>['connection'];

// Bull 4.16.5 is the last release on that major and pins ioredis 5, and BullMQ 5 pins it too, so
// both declare their client against a different copy of ioredis than the one the CLI holds. Same
// client at runtime, two nominally distinct declarations. BullMQ 6 takes ioredis as an optional
// peer and needs no cast.
const asBullClient = (redis: RedisClient) => redis as unknown as BullRedisClient;
const asBullMQConnection = (redis: RedisClient) => redis as unknown as BullMQConnection;

export interface QueueFactoryDeps {
  client: RedisClient;
  readOnly: boolean;
  queueOptions: Record<string, Partial<QueueAdapterOptions>>;
  onWarning(message: string): void;
  onFailed?: FailureListener;
}

export interface QueueFactory {
  createQueue(discovered: DiscoveredQueue): QueueHandle | null;
  close(): Promise<void>;
}

export function createQueueFactory({
  client,
  readOnly,
  queueOptions,
  onWarning,
  onFailed,
}: QueueFactoryDeps): QueueFactory {
  let bullSubscriber: Redis | undefined;
  const clustered = isCluster(client);
  const warnedAboutBull = new Set<string>();
  const enricher = new FailureEnricher();

  function failureListener(
    adapter: BaseAdapter,
    discovered: DiscoveredQueue,
    isClosed: () => boolean,
    readJob: (id: string) => Promise<FailureJob | null | undefined>
  ): FailureListener | undefined {
    if (!onFailed) return undefined;
    return (event) => {
      if (isClosed()) return;
      enricher.notify(
        { ...event, lib: discovered.lib, queueDisplayName: adapter.getName() },
        () => readJob(event.jobId),
        (detailed) => {
          if (!isClosed()) onFailed(detailed);
        }
      );
    };
  }

  function createQueue(discovered: DiscoveredQueue): QueueHandle | null {
    // Bull 3 builds its keys without a hash tag and its Lua touches several at once, so on a
    // cluster every command it issues is a CROSSSLOT away from failing. Skipping it beats
    // showing a queue whose every action errors.
    if (clustered && discovered.lib === 'bull') {
      if (!warnedAboutBull.has(discovered.name)) {
        warnedAboutBull.add(discovered.name);
        onWarning(
          `Skipping Bull queue "${discovered.name}": Bull 3 does not support Redis Cluster. ` +
            'BullMQ queues on the same cluster are unaffected.'
        );
      }

      return null;
    }

    // QueueAdapterOptions.prefix is a display-name prefix, not the Redis key prefix.
    const options: Partial<QueueAdapterOptions> = {
      ...queueOptions[discovered.name],
      readOnlyMode: readOnly || queueOptions[discovered.name]?.readOnlyMode === true,
    };

    if (discovered.lib === 'bullmq') {
      const queue = new BullMQQueue(discovered.name, {
        connection: asBullMQConnection(client),
        prefix: discovered.prefix,
        // The dashboard only reads the queues it discovers, so it must not write their meta hash.
        skipMetasUpdate: true,
      });
      queue.on('error', (error: Error) =>
        onWarning(`Queue "${discovered.name}" connection error: ${describeError(error)}`)
      );

      const adapter = new BullMQAdapter(queue, options);
      let closing: Promise<void> | undefined;
      const listener = failureListener(
        adapter,
        discovered,
        () => !!closing,
        (id) => queue.getJob(id)
      );
      const unsubscribe = listener
        ? subscribeBullMQ(discovered, client, listener, onWarning)
        : undefined;
      return {
        adapter,
        close: () =>
          (closing ??= (async () => {
            try {
              await unsubscribe?.();
            } finally {
              await queue.close();
            }
          })()),
      };
    }

    const queue = new BullQueue(discovered.name, {
      prefix: discovered.prefix,
      createClient: (type) => {
        if (type === 'client') return asBullClient(client);
        // Bull rejects a subscriber that has enableReadyCheck or maxRetriesPerRequest set.
        if (!bullSubscriber) {
          bullSubscriber = (client as Redis).duplicate({
            enableReadyCheck: false,
            maxRetriesPerRequest: null,
          });
        }

        return asBullClient(bullSubscriber);
      },
    });
    queue.on('error', (error: Error) =>
      onWarning(`Queue "${discovered.name}" connection error: ${describeError(error)}`)
    );

    const adapter = new BullAdapter(queue, options);
    let closing: Promise<void> | undefined;
    const listener = failureListener(
      adapter,
      discovered,
      () => !!closing,
      (id) => queue.getJob(id)
    );
    const unsubscribe = listener ? subscribeBull(discovered, queue, listener) : undefined;
    return {
      adapter,
      close: () =>
        (closing ??= (async () => {
          unsubscribe?.();
          try {
            if (unsubscribe && bullSubscriber)
              await bullSubscriber.unsubscribe(queue.toKey('failed'));
          } finally {
            await queue.close();
          }
        })()),
    };
  }

  return {
    createQueue,
    close: async () => {
      enricher.close();
      await bullSubscriber?.quit();
      bullSubscriber = undefined;
    },
  };
}
