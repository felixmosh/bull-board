import React, { Suspense } from 'react';
import { Route, Switch } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import { ConfirmModal } from './components/ConfirmModal/ConfirmModal';
import { Header } from './components/Header/Header';
import { HeaderActions } from './components/HeaderActions/HeaderActions';
import { Menu } from './components/Menu/Menu';
import { Title } from './components/Title/Title';
import { useActiveQueue } from './hooks/useActiveQueue';
import { useScrollTopOnNav } from './hooks/useScrollTopOnNav';
import { useStore } from './hooks/useStore';

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
  const { state, actions, selectedStatuses, confirmProps } = useStore();
  const activeQueue = useActiveQueue(state.data);

  return (
    <>
      <Header>
        <Title name={activeQueue?.name} description={activeQueue?.description} />
        <HeaderActions />
      </Header>
      <main>
        <div>
          {state.loading ? (
            'Loading...'
          ) : (
            <>
              <Suspense fallback={() => 'Loading...'}>
                <Switch>
                  <Route
                    path="/queue/:name"
                    render={() => (
                      <QueuePageLazy
                        queue={activeQueue || null}
                        actions={actions}
                        selectedStatus={selectedStatuses}
                      />
                    )}
                  />

                  <Route
                    path="/"
                    exact
                    render={() => <OverviewPageLazy queues={state.data?.queues} />}
                  />
                </Switch>
              </Suspense>
              <ConfirmModal {...confirmProps} />
            </>
          )}
        </div>
      </main>
      <Menu queues={state.data?.queues} selectedStatuses={selectedStatuses} />
      <ToastContainer />
    </>
  );
};
