import BullQueue from 'bull';
import { QueueEvents, RedisConnection, type ConnectionOptions, type QueueOptions } from 'bullmq';
import type { DiscoveredQueue } from '../discovery';
import type { RedisClient } from '../redisClient';
import type { FailedJobEvent } from './format';

// QueueEvents duplicates the supplied connection. Mark that duplicate as owned so
// forced shutdown also closes it while its initial Redis handshake is pending.
class OwnedEventConnection extends RedisConnection {
  constructor(
    options: ConnectionOptions,
    extra?: ConstructorParameters<typeof RedisConnection>[1]
  ) {
    super(options, { ...extra, shared: false });
  }
}

class FailureQueueEvents extends QueueEvents {
  public override close(): Promise<void> {
    return (this.closing ??= this.connection.close(true).finally(() => {
      this.closed = true;
    }));
  }
}

export type FailureListener = (event: FailedJobEvent) => void;

export function subscribeBullMQ(
  discovered: DiscoveredQueue,
  client: RedisClient,
  onFailed: FailureListener,
  onWarning: (message: string) => void
): () => Promise<void> {
  let closing = false;
  const events = new FailureQueueEvents(
    discovered.name,
    {
      connection: client as unknown as QueueOptions['connection'],
      prefix: discovered.prefix,
    },
    OwnedEventConnection
  );
  const failed = ({ jobId, failedReason }: { jobId: string; failedReason: string }, id: string) => {
    onFailed({
      queue: discovered.name,
      prefix: discovered.prefix,
      jobId,
      reason: failedReason,
      timestamp: Number(id.split('-')[0]) || Date.now(),
    });
  };
  // QueueEvents 'failed' comes from the final transition, not Worker 'failed' attempts.
  events.on('failed', failed);
  events.on('error', () => {
    if (!closing) onWarning('Notification BullMQ event connection error; reconnecting.');
  });
  return async () => {
    closing = true;
    events.off('failed', failed);
    await events.close();
  };
}

export function subscribeBull(
  discovered: DiscoveredQueue,
  queue: BullQueue.Queue,
  onFailed: FailureListener
): () => void {
  const failed = (jobId: string, failedReason: string) =>
    onFailed({
      queue: discovered.name,
      prefix: discovered.prefix,
      jobId: String(jobId),
      reason: failedReason,
      timestamp: Date.now(),
    });
  // Bull publishes global:failed only from moveToFinished, including removeOnFail.
  queue.on('global:failed', failed);
  return () => {
    queue.off('global:failed', failed);
  };
}
