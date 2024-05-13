import React from 'react';
import { QueueCard } from '../../components/QueueCard/QueueCard';
import { StatusLegend } from '../../components/StatusLegend/StatusLegend';
import { useQueues } from '../../hooks/useQueues';
import s from './OverviewPage.module.css';
import { useSearchQueue } from '../../providers/SearchQueueProvider';

export const OverviewPage = () => {
  const { actions } = useQueues();
  const { filteredQueues: queues } = useSearchQueue();
  actions.pollQueues();

  return (
    <section>
      <StatusLegend />
      <ul className={s.overview}>
        {queues?.map((queue) => (
          <li key={queue.name}>
            <QueueCard queue={queue} />
          </li>
        ))}
      </ul>
    </section>
  );
};
