import type { AppQueue } from '@bull-board/api/typings/app';
import { useActiveQueueName } from './useActiveQueueName';
import { useQueues } from './useQueues';

export function useActiveQueue(): AppQueue | null {
  const { queues } = useQueues();
  const activeQueueName = useActiveQueueName();

  if (!queues) {
    return null;
  }

  const activeQueue = queues.find((q) => q.name === activeQueueName);

  return activeQueue || null;
}
