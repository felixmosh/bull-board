import React from 'react';
import { QueueCard } from '../../components/QueueCard/QueueCard';
import { StatusLegend } from '../../components/StatusLegend/StatusLegend';
import { useQueues } from '../../hooks/useQueues';
import s from './OverviewPage.module.css';
import { useCategoryQueues } from '../../hooks/useCategoryQueues';

export const OverviewPage = () => {
  const { actions } = useQueues();
  const { queuesByCategory } = useCategoryQueues();
  actions.pollQueues();

  return (
    <>
      <StatusLegend />

      {Object.keys(queuesByCategory).map((category) => {
        const queues = queuesByCategory[category];
        return (
          <section key={category} className={s.overview}>
            <h2>{category}</h2>
            <ul key={category}>
              {queues.map((queue) => (
                <li key={queue.name}>
                  <QueueCard queue={queue} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
};
