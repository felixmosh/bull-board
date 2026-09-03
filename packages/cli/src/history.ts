import type { BaseAdapter } from '@bull-board/api/baseAdapter';
import type { MetricsHistoryProvider } from '@bull-board/api/typings/app';
import { MetricsRecorder, RedisMetricsHistoryProvider } from '@bull-board/metrics';
import type { Redis } from 'ioredis';
import type { HistoryConfig } from './config/types';
import { describeError } from './describeError';

export interface HistoryRuntime {
  provider: MetricsHistoryProvider;
  start(queues: () => BaseAdapter[]): void;
  stop(): void;
}

export interface HistoryDeps {
  client: Redis;
  config: HistoryConfig;
  onWarning(message: string): void;
}

export function createHistory({ client, config, onWarning }: HistoryDeps): HistoryRuntime {
  const retentionWindow = { retentionDays: config.retentionDays, retention: config.retention };
  const provider = new RedisMetricsHistoryProvider({ connection: client, ...retentionWindow });
  let recorder: MetricsRecorder | null = null;

  return {
    provider,
    start(queues) {
      if (!config.record || recorder) return;

      recorder = new MetricsRecorder({
        queues,
        connection: client,
        ...retentionWindow,
        latency: config.latency,
        snapshotIntervalMs: config.snapshotIntervalMs,
        onLatencyError: (error, queueName) =>
          onWarning(`Latency sampling failed for "${queueName}": ${describeError(error as Error)}`),
      });
      recorder.start();
    },
    stop() {
      recorder?.stop();
      recorder = null;
      provider.disconnect();
    },
  };
}

export async function warnIfCountersUnavailable(
  queues: BaseAdapter[],
  onWarning: (message: string) => void
): Promise<void> {
  if (queues.length === 0) return;

  const populated = await Promise.all(
    queues.map((queue) =>
      queue
        .getMetrics('completed')
        .then((metrics) => (metrics?.data?.length ?? 0) > 0)
        .catch(() => false)
    )
  );
  if (populated.some(Boolean)) return;

  onWarning(
    'No BullMQ metrics data found on any queue. Completed and failed history stays empty ' +
      'until your workers are created with metrics: { maxDataPoints: MetricsTime.ONE_WEEK }. ' +
      'Latency and queue age are recorded either way.'
  );
}
