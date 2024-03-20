import { AppQueue } from '@bull-board/api/typings/app';
import { useActiveQueueName } from './useActiveQueueName';
import { useQueues } from './useQueues';


export function useActiveQueue(): AppQueue | null {
  const { queues } = useQueues();

  if (!queues) {
    return null;
  }

  const activeQueueName = useActiveQueueName();
  const activeQueue = queues.find((q) => q.name === activeQueueName);

  return activeQueue || null;
}
