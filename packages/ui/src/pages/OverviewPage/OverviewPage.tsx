import type { Status } from '@bull-board/api/typings/app';
import React from 'react';
import { useTranslation } from 'react-i18next';
import OverviewDropDownActions from '../../components/OverviewDropDownActions/OverviewDropDownActions';
import { QueueCard } from '../../components/QueueCard/QueueCard';
import { StatusLegend } from '../../components/StatusLegend/StatusLegend';
import { StickyHeader } from '../../components/StickyHeader/StickyHeader';
import { useQueueSearch } from '../../hooks/useQueueSearch';
import { useQuery } from '../../hooks/useQuery';
import { useQueues } from '../../hooks/useQueues';
import { useSortQueues } from '../../hooks/useSortQueues';
import s from './OverviewPage.module.css';

export const OverviewPage = () => {
  const { t } = useTranslation();
  const { actions, queues } = useQueues();
  const query = useQuery();
  const { searchTerm } = useQueueSearch();

  actions.pollQueues();

  const selectedStatus = query.get('status') as Status;
  const searchLower = searchTerm.toLowerCase();
  const filteredQueues =
    queues?.filter(
      (queue) =>
        (!selectedStatus || queue.counts[selectedStatus] > 0) &&
        (!searchTerm || queue.name.toLowerCase().includes(searchLower))
    ) || [];

  const {
    sortedQueues: queuesToView,
    onSort,
    sortKey,
    sortDirection,
  } = useSortQueues(filteredQueues);

  return (
    <section>
      <StickyHeader actions={<></>}>
        <StatusLegend>
          <OverviewDropDownActions
            actions={actions}
            queues={queues}
            onSort={onSort}
            sortBy={sortKey}
            sortDirection={sortDirection}
          />
        </StatusLegend>
      </StickyHeader>
      {queuesToView.length > 0 ? (
        <ul className={s.overview}>
          {queuesToView.map((queue) => (
            <li key={queue.name}>
              <QueueCard queue={queue} />
            </li>
          ))}
        </ul>
      ) : (
        <p className={s.emptyState}>
          {selectedStatus
            ? t('DASHBOARD.EMPTY_STATE_FILTERED', { status: selectedStatus })
            : t('DASHBOARD.EMPTY_STATE')}
        </p>
      )}
    </section>
  );
};
