import { AppQueue } from '@bull-board/api/dist/typings/app';
import { useActiveQueueName } from './useActiveQueueName';
import { Store } from './useStore';

export function useActiveQueue(data: Store['state']['data']): AppQueue | null {
  const activeQueueName = useActiveQueueName();

  if (!data) {
    return null;
  }

  const activeQueue = data.queues?.find((q) => q.name === activeQueueName);

  return activeQueue || null;
}
