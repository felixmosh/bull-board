import React from 'react';
import { QueueCard } from '../../components/QueueCard/QueueCard';
import { StatusLegend } from '../../components/StatusLegend/StatusLegend';
import { useQueues } from '../../hooks/useQueues';
import s from './OverviewPage.module.css';
import { useSelectedStatuses } from '../../hooks/useSelectedStatuses';

export const OverviewPage = () => {
  const { actions, queues } = useQueues();
  actions.pollQueues();

  const selectedStatus = useSelectedStatuses();
  const overviewPageStatus = selectedStatus[''];

  return (
    <section>
      <StatusLegend />

      <ul className={s.overview}>
        {queues?.filter((queue) => overviewPageStatus === 'latest' || queue.counts[overviewPageStatus] > 0).map((queue) => (
          <li key={queue.name}>
            <QueueCard queue={queue} />
          </li>
        ))}
      </ul>
    </section>
  );
};
