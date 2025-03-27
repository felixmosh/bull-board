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
import { QueueSortingDropdown } from '../../components/QueueSortingDropdown/QueueSortingDropdown';
import { QueueSortKey } from '@bull-board/api/typings/app';
import OverviewDropDownActions from '../../components/OverviewDropDownActions/OverviewDropDownActions';

export const OverviewPage = () => {
  const { t } = useTranslation();
  const { actions, queues } = useQueues();
  const query = useQuery();

  actions.pollQueues();
  const selectedStatus = query.get('status') as Status;
  const queuesToView =
    queues?.filter((queue) => !selectedStatus || queue.counts[selectedStatus] > 0) || [];

  const sortHandler = (sortKey: QueueSortKey) => {
    actions.sortQueues(sortKey);
  }

  return (
    <section>
      <div className={s.header}>
        <StatusLegend />
        <OverviewDropDownActions actions={actions} queues={queues} />
      </div>
      <QueueSortingDropdown sortOptions={
        [
            { key: 'alphabetical', label: t('DASHBOARD.SORTING.ALPHABETICAL') },
            { key: 'failed', label: t('DASHBOARD.SORTING.FAILED') },
            { key: 'completed', label: t('DASHBOARD.SORTING.COMPLETED') },
            { key: 'active', label: t('DASHBOARD.SORTING.ACTIVE') },
            { key: 'waiting', label: t('DASHBOARD.SORTING.WAITING') },
            { key: 'delayed', label: t('DASHBOARD.SORTING.DELAYED') },
          ]
        } 
        sortHandler={sortHandler}
        className={s.dropdown} 
      />
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
