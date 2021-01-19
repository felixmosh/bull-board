import React from 'react'
import { BrowserRouter, Redirect, Route, Switch } from 'react-router-dom'
import { Header } from './Header/Header'
import { useStore } from '../hooks/useStore'
import { Menu } from './Menu/Menu'

import { QueuePage } from './QueuePage/QueuePage'
import { RedisStats } from './RedisStats/RedisStats'

export const App = ({ basePath }: { basePath: string }) => {
  const { state, actions, selectedStatuses } = useStore(basePath)

  return (
    <BrowserRouter basename={basePath}>
      <Header>
        {state.data?.stats && <RedisStats stats={state.data?.stats} />}
      </Header>
      <main>
        <div>
          {state.loading ? (
            'Loading...'
          ) : (
            <Switch>
              <Route
                path="/queue/:name"
                render={({ match: { params } }) => {
                  const queue = state.data?.queues.find(
                    (q) => q.name === params.name,
                  )

                  return (
                    <QueuePage
                      queue={queue}
                      actions={actions}
                      selectedStatus={selectedStatuses}
                    />
                  )
                }}
              />

              <Route exact path="/">
                <Redirect to={`/queue/${state.data?.queues[0].name}`} />
              </Route>
            </Switch>
          )}
        </div>
      </main>
      <Menu queues={state.data?.queues.map((q) => q.name)} />
    </BrowserRouter>
  )
}
