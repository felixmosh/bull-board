import React from 'react'

import { STATUSES, Status } from './constants'
import { AppQueue, AppJob } from '../../@types/app'
import { Jobs } from './Jobs'

type MenuItemProps = {
  status: Status
  count: number
  onClick: () => void
  selected: boolean
}

const MenuItem = ({ status, count, onClick, selected }: MenuItemProps) => (
  <div
    className={`menu-item ${status} ${selected ? 'selected' : ''} ${
      count === 0 ? 'off' : 'on'
    }`}
    onClick={onClick}
  >
    {status !== 'latest' && <b className="count">{count}</b>} {status}
  </div>
)
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
  promoteJob: (job: AppJob) => () => Promise<void>
}

// We need to extend so babel doesn't think it's JSX
const keysOf = <Target extends {}>(target: Target) =>
  Object.keys(target) as (keyof Target)[]

export const Queue = ({
  cleanAllDelayed,
  cleanAllFailed,
  cleanAllCompleted,
  queue,
  retryAll,
  retryJob,
  promoteJob,
  selectedStatus,
  selectStatus,
}: QueueProps) => (
  <section>
    <h3>{queue.name}</h3>
    <div className="menu-list">
      {keysOf(STATUSES).map(status => (
        <MenuItem
          key={`${queue.name}-${status}`}
          status={status}
          count={queue.counts[status]}
          onClick={() => selectStatus({ [queue.name]: status })}
          selected={selectedStatus === status}
        />
      ))}
    </div>
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
          promoteJob={promoteJob}
          queue={queue}
          status={selectedStatus}
        />
      </>
    )}
  </section>
)
