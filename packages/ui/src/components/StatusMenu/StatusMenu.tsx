import type { AppQueue } from '@bull-board/api/typings/app';
import { PropsWithChildren } from 'react';
import { useJobSearchParams } from '../../hooks/useJobSearch';
import { links } from '../../utils/links';
import { StatusTabs } from '../StatusTabs/StatusTabs';

export const StatusMenu = ({ queue, children }: PropsWithChildren<{ queue: AppQueue }>) => {
  const jobSearch = useJobSearchParams();
  const isSearching = queue.searchable && !!jobSearch;
  const items = queue.statuses.map((status) => {
    const isLatest = status === 'latest';
    return {
      status,
      to: links.queuePage(
        queue.name,
        { [queue.name]: status },
        queue.searchable ? jobSearch : null
      ),
      isActive: (_path: any, { search }: { search: string }) => {
        const query = new URLSearchParams(search);
        return query.get('status') === status || (isLatest && query.get('status') === null);
      },
      count: isSearching ? undefined : queue.counts[status],
      dot: !isLatest,
    };
  });

  return <StatusTabs items={items}>{children}</StatusTabs>;
};
