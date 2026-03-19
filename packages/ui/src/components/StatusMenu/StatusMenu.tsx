import type { AppQueue } from '@bull-board/api/typings/app';
import React, { PropsWithChildren } from 'react';
import { links } from '../../utils/links';
import { StatusTabs } from '../StatusTabs/StatusTabs';

export const StatusMenu = ({ queue, children }: PropsWithChildren<{ queue: AppQueue }>) => {
  const items = queue.statuses.map((status) => {
    const isLatest = status === 'latest';
    return {
      status,
      to: links.queuePage(queue.name, { [queue.name]: status }),
      isActive: (_path: any, { search }: { search: string }) => {
        const query = new URLSearchParams(search);
        return query.get('status') === status || (isLatest && query.get('status') === null);
      },
      count: queue.counts[status],
    };
  });

  return (
    <StatusTabs items={items}>
      {children}
    </StatusTabs>
  );
};
