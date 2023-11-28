import { AppQueue } from '@bull-board/api/typings/app';
import { useActiveQueueName } from './useActiveQueueName';
import { QueuesState } from './useQueues';

export function useActiveQueue(data: Pick<QueuesState, 'queues'>): AppQueue | null {
  const activeQueueName = useActiveQueueName();

  if (!data.queues) {
    return null;
  }

  const activeQueue = data.queues.find((q) => q.name === activeQueueName);

  return activeQueue || null;
}
