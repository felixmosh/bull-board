import React from 'react';
import { Redirect, Route, Switch } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import { useActiveQueue } from '../hooks/useActiveQueue';
import { useScrollTopOnNav } from '../hooks/useScrollTopOnNav';
import { useStore } from '../hooks/useStore';
import { ConfirmModal } from './ConfirmModal/ConfirmModal';
import { Header } from './Header/Header';
import { HeaderActions } from './HeaderActions/HeaderActions';
import { Menu } from './Menu/Menu';
import { QueuePage } from './QueuePage/QueuePage';
import { QueueTitle } from './QueueTitle/QueueTitle';

export const App = () => {
  useScrollTopOnNav();
  const { state, actions, selectedStatuses, confirmProps } = useStore();
  const activeQueue = useActiveQueue(state.data);

  return (
    <>
      <Header>
        {!!activeQueue && <QueueTitle queue={activeQueue} />}
        <HeaderActions />
      </Header>
      <main>
        <div>
          {state.loading ? (
            'Loading...'
          ) : (
            <>
              <Switch>
                <Route
                  path="/queue/:name"
                  render={() => (
                    <QueuePage
                      queue={activeQueue || undefined}
                      actions={actions}
                      selectedStatus={selectedStatuses}
                    />
                  )}
                />

                <Route path="/" exact>
                  {!!state.data &&
                    Array.isArray(state.data?.queues) &&
                    state.data.queues.length > 0 && (
                      <Redirect to={`/queue/${encodeURIComponent(state.data?.queues[0].name)}`} />
                    )}
                </Route>
              </Switch>
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
