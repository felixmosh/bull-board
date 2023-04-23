import { AppQueue } from '@bull-board/api/dist/typings/app';
import React from 'react';
import { QueueCard } from '../../components/QueueCard/QueueCard';
import { StatusLegend } from '../../components/StatusLegend/StatusLegend';
import s from './OverviewPage.module.css';

interface IOverviewPageProps {
  queues: AppQueue[] | undefined;
}

export const OverviewPage = (props: IOverviewPageProps) => (
  <section>
    <StatusLegend />
    <ul className={s.overview}>
      {props.queues?.map((queue) => (
        <li key={queue.name}>
          <QueueCard queue={queue} />
        </li>
      ))}
    </ul>
  </section>
);
