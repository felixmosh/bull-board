import React from 'react'
import { AppJob, AppQueue } from '../../@types/app'

import { Status } from './constants'
import { Jobs } from './Jobs'

const ACTIONABLE_STATUSES = ['failed', 'delayed', 'completed']

interface QueueActionProps {
  queue: QueueProps['queue']
  retryAll: QueueProps['retryAll']
  cleanAllFailed: QueueProps['cleanAllFailed']
  cleanAllDelayed: QueueProps['cleanAllDelayed']
  cleanAllCompleted: QueueProps['cleanAllCompleted']
  status: Status
}

const isStatusActionable = (status: Status): boolean =>
  ACTIONABLE_STATUSES.includes(status)

const QueueActions = ({
  status,
  retryAll,
  cleanAllFailed,
  cleanAllDelayed,
  cleanAllCompleted,
}: QueueActionProps) => {
  if (!isStatusActionable(status)) {
    return <div />
  }

  return (
    <div>
      {status === 'failed' && (
        <div>
          <button style={{ margin: 10 }} onClick={retryAll}>
            Retry all
          </button>
          <button style={{ margin: 10 }} onClick={cleanAllFailed}>
            Clean all
          </button>
        </div>
      )}
      {status === 'delayed' && (
        <button style={{ margin: 10 }} onClick={cleanAllDelayed}>
          Clean all
        </button>
      )}
      {status === 'completed' && (
        <button style={{ margin: 10 }} onClick={cleanAllCompleted}>
          Clean all
        </button>
      )}
    </div>
  )
}

interface QueueProps {
  queue: AppQueue
  selectedStatus: Status
  selectStatus: (statuses: Record<string, Status>) => void
  cleanAllDelayed: () => Promise<void>
  cleanAllFailed: () => Promise<void>
  cleanAllCompleted: () => Promise<void>
  retryAll: () => Promise<void>
  retryJob: (job: AppJob) => () => Promise<void>
  cleanJob: (job: AppJob) => () => Promise<void>
  promoteJob: (job: AppJob) => () => Promise<void>
}

export const Queue = ({
  cleanAllDelayed,
  cleanAllFailed,
  cleanAllCompleted,
  queue,
  retryAll,
  retryJob,
  cleanJob,
  promoteJob,
  selectedStatus,
}: QueueProps) => (
  <section>
    <h3>{queue.name}</h3>
    {selectedStatus && (
      <>
        <QueueActions
          retryAll={retryAll}
          cleanAllDelayed={cleanAllDelayed}
          cleanAllFailed={cleanAllFailed}
          cleanAllCompleted={cleanAllCompleted}
          queue={queue}
          status={selectedStatus}
        />
        <Jobs
          retryJob={retryJob}
          cleanJob={cleanJob}
          promoteJob={promoteJob}
          queue={queue}
          status={selectedStatus}
        />
      </>
    )}
  </section>
)
