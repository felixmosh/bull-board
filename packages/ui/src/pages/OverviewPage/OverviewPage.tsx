import { Status } from '@bull-board/api/dist/typings/app';
import React from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { QueueCard } from '../../components/QueueCard/QueueCard';
import { StatusLegend } from '../../components/StatusLegend/StatusLegend';
import { useQuery } from '../../hooks/useQuery';
import { useQueues } from '../../hooks/useQueues';
import { links } from '../../utils/links';
import s from './OverviewPage.module.css';

export const OverviewPage = () => {
  const { t } = useTranslation();
  const { actions, queues } = useQueues();
  const query = useQuery();

  actions.pollQueues();
  const selectedStatus = query.get('status') as Status;
  const queuesToView =
    queues?.filter((queue) => !selectedStatus || queue.counts[selectedStatus] > 0) || [];
  return (
    <section>
      <StatusLegend />

      {queuesToView.length > 0 && (
        <ul className={s.overview}>
          {queuesToView.map((queue) => (
            <li key={queue.name}>
              <QueueCard queue={queue} />
            </li>
          ))}
        </ul>
      )}
      {queuesToView.length === 0 && !!selectedStatus && (
        <div className={s.message}>
          <Trans
            t={t}
            i18nKey="DASHBOARD.NO_FILTERED_MESSAGE"
            values={{ status: t(`QUEUE.STATUS.${selectedStatus.toUpperCase()}`) }}
            components={{ lnk: <NavLink to={links.dashboardPage()} /> }}
          />
        </div>
      )}
    </section>
  );
};
