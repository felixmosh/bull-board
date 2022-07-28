import React from 'react';
import { Redirect, Route, Switch } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import { useActiveQueue } from '../hooks/useActiveQueue';
import { useScrollTopOnNav } from '../hooks/useScrollTopOnNav';
import { useStore } from '../hooks/useStore';
import { Api } from '../services/Api';
import { QueueTitle } from './QueueTitle/QueueTitle';
import { ConfirmModal } from './ConfirmModal/ConfirmModal';
import { Header } from './Header/Header';
import { Menu } from './Menu/Menu';
import { QueuePage } from './QueuePage/QueuePage';
import { RedisStats } from './RedisStats/RedisStats';

export const App = ({ api }: { api: Api }) => {
  useScrollTopOnNav();
  const { state, actions, selectedStatuses, confirmProps } = useStore(api);
  const activeQueue = useActiveQueue(state.data);

  return (
    <>
      <Header>
        {!!activeQueue && <QueueTitle queue={activeQueue} />}
        {state.data?.stats && <RedisStats stats={state.data?.stats} />}
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
