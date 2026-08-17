import { PropsWithChildren, useMemo } from 'react';
import { queueStatsStatusList } from '../../constants/queue-stats-status';
import { useQueues } from '../../hooks/useQueues';
import { useSearchParams } from '../../hooks/useSearchParams';
import { links } from '../../utils/links';
import { StatusTabs } from '../StatusTabs/StatusTabs';

export const StatusLegend = ({ children }: PropsWithChildren<{}>) => {
  const { status: activeStatus } = useSearchParams();
  const { queues } = useQueues();

  /* Board-wide totals per status, so the filter you are about to click tells you how
     much is behind it. */
  const totals = useMemo(() => {
    const counts: Partial<Record<string, number>> = {};
    for (const queue of queues ?? []) {
      for (const status of queue.statuses) {
        counts[status] = (counts[status] || 0) + (queue.counts[status] || 0);
      }
    }
    return counts;
  }, [queues]);

  const items = queueStatsStatusList.map((status) => ({
    status,
    to: links.dashboardPage(activeStatus === status ? undefined : status),
    isActive: () => activeStatus === status,
    count: totals[status],
  }));

  return <StatusTabs items={items}>{children}</StatusTabs>;
};
