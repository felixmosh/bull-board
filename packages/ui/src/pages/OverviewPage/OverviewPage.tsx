import { Status } from '@bull-board/api/dist/typings/app';
import React, { useState } from 'react';
import { QueueCard } from '../../components/QueueCard/QueueCard';
import { StatusLegend } from '../../components/StatusLegend/StatusLegend';
import { useQuery } from '../../hooks/useQuery';
import { useQueues } from '../../hooks/useQueues';
import s from './OverviewPage.module.css';
import { QueueSortKey } from '@bull-board/api/typings/app';
import OverviewDropDownActions from '../../components/OverviewDropDownActions/OverviewDropDownActions';

export const OverviewPage = () => {
  const { actions, queues } = useQueues();
  const query = useQuery();
  const [activeQueueSortKey, setActiveQueueSortKey] = useState<QueueSortKey>('alphabetical');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  actions.pollQueues();
  const selectedStatus = query.get('status') as Status;
  const filteredQueues = queues?.filter((queue) => !selectedStatus || queue.counts[selectedStatus] > 0) || [];
  
  const queuesToView = [...filteredQueues].sort((a, b) => {
    if (activeQueueSortKey === 'alphabetical') {
      return sortDirection === 'asc'
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name);
    }
    return sortDirection === 'asc'
      ? a.counts[activeQueueSortKey] - b.counts[activeQueueSortKey]
      : b.counts[activeQueueSortKey] - a.counts[activeQueueSortKey];
  });

  const sortHandler = (sortKey: QueueSortKey) => {
    if (sortKey === activeQueueSortKey) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setActiveQueueSortKey(sortKey);
      setSortDirection('asc');
    }
  };

  return (
    <section>
      <div className={s.header}>
        <StatusLegend />
        <OverviewDropDownActions 
          actions={actions} 
          queues={queues} 
          onSort={sortHandler}
          selectedSort={activeQueueSortKey}
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
