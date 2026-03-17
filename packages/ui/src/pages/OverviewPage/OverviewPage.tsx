import type { Status } from '@morpho-org/bull-board-api/typings/app';
import React from 'react';
import OverviewDropDownActions from '../../components/OverviewDropDownActions/OverviewDropDownActions';
import { StatusLegend } from '../../components/StatusLegend/StatusLegend';
import { useConnectionFilterStore } from '../../hooks/useConnectionFilterStore';
import { useDisplayGroupFilterStore } from '../../hooks/useDisplayGroupFilterStore';
import { useQueueFilterStore } from '../../hooks/useQueueFilterStore';
import { useQuery } from '../../hooks/useQuery';
import { useQueues } from '../../hooks/useQueues';
import { useSortQueues } from '../../hooks/useSortQueues';
import s from './OverviewPage.module.css';
import { QueueGroupCard } from '../../components/QueueGroupCard/QueueGroupCard';

export const OverviewPage = () => {
  const { actions, queues } = useQueues();
  const query = useQuery();

  actions.pollQueues();

  const { searchTerm } = useQueueFilterStore();
  const { disabledConnections } = useConnectionFilterStore();
  const { disabledDisplayGroups } = useDisplayGroupFilterStore();
  const selectedStatus = query.get('status') as Status;
  const filteredQueues =
    queues?.filter(
      (queue) =>
        (!selectedStatus || queue.counts[selectedStatus] > 0) &&
        queue.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
        (!queue.connection || !disabledConnections.has(queue.connection)) &&
        (!queue.displayGroup || !disabledDisplayGroups.has(queue.displayGroup))
    ) || [];

  const {
    sortedTree: queuesToView,
    onSort,
    sortKey,
    sortDirection,
  } = useSortQueues(filteredQueues);

  return (
    <section>
      <div className={s.header}>
        <StatusLegend />
        <OverviewDropDownActions
          actions={actions}
          queues={filteredQueues}
          onSort={onSort}
          sortBy={sortKey}
          sortDirection={sortDirection}
        />
      </div>
      <ul className={s.overview}>
        {queuesToView.children.map((group) => (
          <QueueGroupCard
            key={`${group.prefix}.${group.name}`}
            group={group}
            actions={actions}
            hasSiblingGroups={queuesToView.children.some((c) => !c.queue)}
          />
        ))}
      </ul>
    </section>
  );
};
