import { AppQueue } from '@bull-board/api/dist/typings/app';
import { matchPath } from 'react-router';
import { useLocation } from 'react-router-dom';
import { Store } from './useStore';

export function useActiveQueue(data: Store['state']['data']): AppQueue | null {
  const { pathname } = useLocation();

  if (!data) {
    return null;
  }

  const match = matchPath<{ name: string }>(pathname, {
    path: '/queue/:name',
    exact: true,
    strict: true,
  });

  const activeQueueName = decodeURIComponent(match?.params.name || '');

  const activeQueue = data?.queues?.find((q) => q.name === activeQueueName);

  return activeQueue || null;
}
