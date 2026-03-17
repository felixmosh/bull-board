import React, { Suspense, useEffect } from 'react';
import { Route, Switch, useRouteMatch } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import { ConfirmModal } from './components/ConfirmModal/ConfirmModal';
import { ConnectionToggles } from './components/ConnectionToggles/ConnectionToggles';
import { DisplayGroupToggles } from './components/DisplayGroupToggles/DisplayGroupToggles';
import { Header } from './components/Header/Header';
import { HeaderActions } from './components/HeaderActions/HeaderActions';
import { Loader } from './components/Loader/Loader';
import { Menu } from './components/Menu/Menu';
import { Title } from './components/Title/Title';
import { useConfirm } from './hooks/useConfirm';
import { useDarkMode } from './hooks/useDarkMode';
import { useLanguageWatch } from './hooks/useLanguageWatch';
import { useMobileQuery } from './hooks/useMobileQuery';
import { useConnectionFilterStore } from './hooks/useConnectionFilterStore';
import { useDisplayGroupFilterStore } from './hooks/useDisplayGroupFilterStore';
import { useQueues } from './hooks/useQueues';
import { useScrollTopOnNav } from './hooks/useScrollTopOnNav';
import { useSyncDisabledFilterWithUrl } from './hooks/useSyncDisabledFilterWithUrl';

const JobPageLazy = React.lazy(() =>
  import('./pages/JobPage/JobPage').then(({ JobPage }) => ({ default: JobPage }))
);

const QueuePageLazy = React.lazy(() =>
  import('./pages/QueuePage/QueuePage').then(({ QueuePage }) => ({ default: QueuePage }))
);

const OverviewPageLazy = React.lazy(() =>
  import('./pages/OverviewPage/OverviewPage').then(({ OverviewPage }) => ({
    default: OverviewPage,
  }))
);

export const App = () => {
  useScrollTopOnNav();
  const { queues, actions: queueActions } = useQueues();
  const { confirmProps } = useConfirm();
  const isMobile = useMobileQuery();
  useLanguageWatch();
  useDarkMode();
  const isQueuePage = useRouteMatch('/queue/:name');
  const { disabledConnections, setDisabledConnections } = useConnectionFilterStore();
  const { disabledDisplayGroups, setDisabledDisplayGroups } = useDisplayGroupFilterStore();
  const connectionNames = [
    ...new Set((queues || []).map((queue) => queue.connection).filter((name): name is string => !!name)),
  ];
  const displayGroupNames = [
    ...new Set((queues || []).map((queue) => queue.displayGroup).filter((name): name is string => !!name)),
  ];

  useSyncDisabledFilterWithUrl(
    'dc',
    connectionNames,
    disabledConnections,
    setDisabledConnections
  );
  useSyncDisabledFilterWithUrl(
    'dg',
    displayGroupNames,
    disabledDisplayGroups,
    setDisabledDisplayGroups
  );

  useEffect(() => {
    queueActions.updateQueues();
  }, []);

  return (
    <>
      <Header>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', overflow: 'hidden', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0 }}>
              <Title />
              {!isQueuePage && <ConnectionToggles />}
            </div>
            {!isQueuePage && <DisplayGroupToggles />}
          </div>
          <div style={{ flexShrink: 0 }}>
            <HeaderActions />
          </div>
        </div>
      </Header>
      {!isMobile && <Menu />}
      <main>
        <div>
          <Suspense fallback={<Loader />}>
            <Switch>
              <Route path="/queue/:name/:jobId" render={() => <JobPageLazy />} />
              <Route path="/queue/:name" render={() => <QueuePageLazy />} />

              <Route path="/" exact render={() => <OverviewPageLazy />} />
            </Switch>
          </Suspense>
          <ConfirmModal {...confirmProps} />
        </div>
      </main>
      <ToastContainer />
    </>
  );
};
