import React from 'react'

import { Queue as QueueElement } from './Queue'
import { RedisStats } from './RedisStats'
import { Header } from './Header'
import { useStore } from './hooks/useStore'
import { Job, JobCounts } from 'bull'
import { Job as JobMq } from 'bullmq'

interface Queueue {
  name: string
  counts: JobCounts
  jobs: (Job | JobMq)[]
}

export const App = ({ basePath }: { basePath: string }) => {
  const {
    state,
    selectedStatuses,
    setSelectedStatuses,
    retryJob,
    retryAll,
    cleanAllDelayed,
    cleanAllFailed,
  } = useStore(basePath)

  return (
    <>
      <Header />
      <main>
        {state.loading ? (
          'Loading...'
        ) : (
          <>
            {state.data && state.data.stats ? (
              <RedisStats stats={state.data.stats} />
            ) : (
              <>No stats to display </>
            )}

            {state.data.queues.map((queue: Queueue) => (
              <QueueElement
                queue={queue}
                key={queue.name}
                selectedStatus={selectedStatuses[queue.name]}
                selectStatus={setSelectedStatuses}
                retryJob={retryJob(queue.name)}
                retryAll={retryAll(queue.name)}
                cleanAllDelayed={cleanAllDelayed(queue.name)}
                cleanAllFailed={cleanAllFailed(queue.name)}
              />
            ))}
          </>
        )}
      </main>
    </>
  )
}
