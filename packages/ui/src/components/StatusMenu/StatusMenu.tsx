import type { AppQueue } from '@bull-board/api/typings/app';
import { PropsWithChildren } from 'react';
import { useLocation } from 'react-router-dom';
import { carryJobFilters } from '../../hooks/useJobFilters';
import { links } from '../../utils/links';
import { StatusTabs } from '../StatusTabs/StatusTabs';

export const StatusMenu = ({ queue, children }: PropsWithChildren<{ queue: AppQueue }>) => {
  const { search: currentSearch } = useLocation();
  const items = queue.statuses.map((status) => {
    const isLatest = status === 'latest';
    const to = links.queuePage(queue.name, { [queue.name]: status });
    return {
      status,
      to: { ...to, search: carryJobFilters(to.search, currentSearch) },
      isActive: (_path: any, { search }: { search: string }) => {
        const query = new URLSearchParams(search);
        return query.get('status') === status || (isLatest && query.get('status') === null);
      },
      count: queue.counts[status],
      dot: !isLatest,
    };
  });

  return <StatusTabs items={items}>{children}</StatusTabs>;
};
