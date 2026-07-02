import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader } from '../../components/Loader/Loader';
import { OverviewControls } from '../../components/OverviewControls/OverviewControls';
import OverviewDropDownActions from '../../components/OverviewDropDownActions/OverviewDropDownActions';
import { OverviewTree } from '../../components/OverviewTree/OverviewTree';
import { QueueCard } from '../../components/QueueCard/QueueCard';
import { StatusLegend } from '../../components/StatusLegend/StatusLegend';
import { StickyHeader } from '../../components/StickyHeader/StickyHeader';
import { useElementHeight } from '../../hooks/useElementHeight';
import { useQueues } from '../../hooks/useQueues';
import { useQueueSearch } from '../../hooks/useQueueSearch';
import { useSearchParams } from '../../hooks/useSearchParams';
import { useSettingsStore } from '../../hooks/useSettings';
import { useSortQueues } from '../../hooks/useSortQueues';
import { useUIConfig } from '../../hooks/useUIConfig';
import { collectGroupPaths, toTree } from '../../utils/toTree';
import s from './OverviewPage.module.css';

export const OverviewPage = () => {
  const { t } = useTranslation();
  const { actions, queues, loading } = useQueues();
  const query = useSearchParams();
  const { searchTerm } = useQueueSearch();
  const groupedSetting = useSettingsStore((state) => state.overview.grouped);
  const groupedDefault = useUIConfig().overview?.groupByDelimiter ?? false;
  const sortQueues = useSettingsStore((state) => state.sortQueues);
  const [headerRef, headerHeight] = useElementHeight<HTMLDivElement>();

  const selectedStatus = query.status;
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

  const tree = useMemo(() => toTree(filteredQueues, sortQueues), [filteredQueues, sortQueues]);
  const groupPaths = useMemo(() => collectGroupPaths(tree), [tree]);
  const hasGroups = groupPaths.length > 0;
  const grouped = (groupedSetting ?? groupedDefault) && hasGroups;
  const searchActive = searchTerm.trim().length > 0;

  return (
    <section
      style={
        {
          '--overview-group-top': `calc(var(--header-height) + ${headerHeight}px)`,
        } as React.CSSProperties
      }
    >
      <StickyHeader actions={<></>} ref={headerRef}>
        <StatusLegend>
          <div className={s.headerControls}>
            <OverviewControls grouped={grouped} groupPaths={groupPaths} />
            <OverviewDropDownActions
              actions={actions}
              queues={queues}
              onSort={onSort}
              sortBy={sortKey}
              sortDirection={sortDirection}
            />
          </div>
        </StatusLegend>
      </StickyHeader>
      {loading && !queues ? (
        <Loader />
      ) : filteredQueues.length === 0 ? (
        <p className={s.emptyState}>
          {selectedStatus
            ? t('DASHBOARD.EMPTY_STATE_FILTERED', { status: selectedStatus })
            : t('DASHBOARD.EMPTY_STATE')}
        </p>
      ) : grouped ? (
        <OverviewTree tree={tree} searchActive={searchActive} />
      ) : (
        <ul className={s.overview}>
          {queuesToView.map((queue) => (
            <li key={queue.name}>
              <QueueCard queue={queue} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
