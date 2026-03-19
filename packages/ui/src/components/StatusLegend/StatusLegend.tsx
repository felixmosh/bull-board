import React, { PropsWithChildren } from 'react';
import { queueStatsStatusList } from '../../constants/queue-stats-status';
import { useQuery } from '../../hooks/useQuery';
import { links } from '../../utils/links';
import { StatusTabs } from '../StatusTabs/StatusTabs';

export const StatusLegend = ({ children }: PropsWithChildren<{}>) => {
  const query = useQuery();
  const activeStatus = query.get('status');

  const items = queueStatsStatusList.map((status) => ({
    status,
    to: links.dashboardPage(activeStatus === status ? undefined : status),
    isActive: () => activeStatus === status,
  }));

  return <StatusTabs items={items}>{children}</StatusTabs>;
};
