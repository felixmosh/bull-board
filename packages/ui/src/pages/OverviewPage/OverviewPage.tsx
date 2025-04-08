import { Status } from '@bull-board/api/dist/typings/app';
import React from 'react';
import OverviewDropDownActions from '../../components/OverviewDropDownActions/OverviewDropDownActions';
import { QueueCard } from '../../components/QueueCard/QueueCard';
import { StatusLegend } from '../../components/StatusLegend/StatusLegend';
import { useQuery } from '../../hooks/useQuery';
import { useQueues } from '../../hooks/useQueues';
import { useSortQueues } from '../../hooks/useSortQueues';
import s from './OverviewPage.module.css';

export const OverviewPage = () => {
  const { actions, queues } = useQueues();
  const query = useQuery();

  actions.pollQueues();

  const selectedStatus = query.get('status') as Status;
  const filteredQueues =
    queues?.filter((queue) => !selectedStatus || queue.counts[selectedStatus] > 0) || [];

  const {
    sortedQueues: queuesToView,
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
          queues={queues}
          onSort={onSort}
          sortBy={sortKey}
          sortDirection={sortDirection}
        />
      </div>
      <ul className={s.overview}>
        {queuesToView.map((queue) => (
          <li key={queue.name}>
            <QueueCard queue={queue} />
          </li>
        ))}
      </ul>
    </section>
  );
};
