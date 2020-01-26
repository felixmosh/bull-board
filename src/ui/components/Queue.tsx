// REVIEW: I feel like this file has become quite chockfull of responsabilities.
// WDYT about splitting it?

import React, { useState } from 'react'
import {
  getYear,
  format,
  isToday,
  formatDistance,
  formatDistanceStrict,
} from 'date-fns'
import Highlight from 'react-highlight'

import { FIELDS, STATUSES, Status, Field } from './constants'
import { AppQueue, AppJob } from '../../@types/app'

const today = new Date()

type TimeStamp = number | Date

const formatDate = (ts: TimeStamp) => {
  if (isToday(ts)) {
    return format(ts, 'HH:mm:ss')
  }

  return getYear(ts) === getYear(today)
    ? format(ts, 'MM/dd HH:mm:ss')
    : format(ts, 'MM/dd/yyyy HH:mm:ss')
}

const Timestamp = ({
  ts,
  prev,
}: {
  ts: TimeStamp | null
  prev?: TimeStamp | null
}) => {
  if (ts === null) {
    // REVIEW: what should be the timestamp for null?
    //  Currently we're passing `job.finishedOn` to this component, which might be null
    return null
  }

  const date = formatDate(ts)

  return (
    <>
      {date}{' '}
      {ts && prev && (
        <small>({formatDistance(ts, prev, { includeSeconds: true })})</small>
      )}
    </>
  )
}

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

const PlusIcon = () => (
  <svg width={18} style={{ verticalAlign: 'middle' }} viewBox="0 0 14 14">
    <circle cx="7" cy="7" r="6" stroke="none" strokeWidth="2" fill="#f4f4f8" />

    <line x1="4" y1="7" x2="10" y2="7" stroke="#333" strokeWidth="1" />
    <line x1="7" y1="4" x2="7" y2="10" stroke="#333" strokeWidth="1" />
  </svg>
)

const PlayIcon = () => (
  <svg width={18} style={{ verticalAlign: 'middle' }} viewBox="0 0 14 14">
    <circle cx="7" cy="7" r="6" stroke="none" strokeWidth="2" fill="#f4f4f8" />

    <line x1="5" y1="5" x2="9" y2="7" stroke="#333" strokeWidth="1" />
    <line x1="9" y1="7" x2="5" y2="9" stroke="#333" strokeWidth="1" />
  </svg>
)

const CheckIcon = () => (
  <svg width={18} style={{ verticalAlign: 'middle' }} viewBox="0 0 14 14">
    <circle cx="7" cy="7" r="6" stroke="none" strokeWidth="2" fill="#f4f4f8" />

    <circle cx="7" cy="7" r="2" stroke="#333" strokeWidth="1" fill="none" />
  </svg>
)

type FieldProps = {
  job: AppJob
  retryJob: () => Promise<void>
}

const fieldComponents: Record<Field, React.FC<FieldProps>> = {
  id: ({ job }) => <b>#{job.id}</b>,

  timestamps: ({ job }) => (
    <div className="timestamps">
      <div>
        <PlusIcon /> <Timestamp ts={job.timestamp} />
      </div>
      {job.processedOn && (
        <div>
          <PlayIcon /> <Timestamp ts={job.processedOn} prev={job.timestamp} />
        </div>
      )}
      {job.finishedOn && (
        <div>
          <CheckIcon /> <Timestamp ts={job.finishedOn} prev={job.processedOn} />
        </div>
      )}
    </div>
  ),

  name: ({ job }) => <>{job.name === '__default__' ? '--' : job.name}</>,

  finish: ({ job }) => <Timestamp ts={job.finishedOn} prev={job.processedOn} />,

  progress: ({ job }) => {
    switch (typeof job.progress) {
      case 'object':
        return (
          <Highlight className="json">
            {JSON.stringify(job.progress, null, 2)}
          </Highlight>
        )
      case 'number':
        if (job.progress > 100) {
          return <div className="progress-wrapper">{job.progress}</div>
        }

        return (
          <div className="progress-wrapper">
            <div
              className="progress-bar"
              style={{
                width: `${job.progress}%`,
              }}
            >
              {job.progress}
              %&nbsp;
            </div>
          </div>
        )
      default:
        return <>--</>
    }
  },

  attempts: ({ job }) => <>{job.attempts}</>,

  delay: ({ job }) => (
    // REVIEW: What should we do if timestamp comes as null?
    // Also, job.delay is a boolean, why are summing 1 or 0 to it? D:
    <>{formatDistanceStrict((job.timestamp || 0) + +job.delay, Date.now())}</>
  ),

  failedReason: ({ job }) => {
    return (
      <>
        {job.failedReason || 'NA'}
        <Highlight className="javascript">{job.stacktrace}</Highlight>
      </>
    )
  },

  data: ({ job }) => {
    const [showData, toggleData] = useState(false)

    return (
      <>
        <button onClick={() => toggleData(!showData)}>Toggle data</button>
        <Highlight className="json">
          {showData && JSON.stringify(job.data, null, 2)}
        </Highlight>
      </>
    )
  },

  opts: ({ job }) => (
    <Highlight className="json">{JSON.stringify(job.opts, null, 2)}</Highlight>
  ),

  retry: ({ retryJob }) => <button onClick={retryJob}>Retry</button>,
}

const Jobs = ({
  retryJob,
  queue: { jobs, name },
  status,
}: {
  retryJob: (job: AppJob) => () => Promise<void>
  queue: AppQueue
  status: Status
}) => {
  if (!jobs.length) {
    return <>No jobs with status {status}</>
  }

  return (
    <table>
      <thead>
        <tr>
          {FIELDS[status].map(field => (
            <th key={field}>{field}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {jobs.map(job => (
          <tr key={job.id}>
            {FIELDS[status].map(field => {
              const Field = fieldComponents[field]

              return (
                <td key={`${name}-${job.id}-${field}`}>
                  <Field job={job} retryJob={retryJob(job)} />
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

type Actionable = 'failed' | 'delayed'

interface QueueActionProps {
  queue: QueueProps['queue']
  retryAll: QueueProps['retryAll']
  cleanAllFailed: QueueProps['cleanAllFailed']
  cleanAllDelayed: QueueProps['cleanAllDelayed']
  status: Status
}

const actions: Record<Actionable, React.FC<QueueActionProps>> = {
  failed: ({ retryAll, cleanAllFailed }: any) => (
    <div>
      <button onClick={retryAll}>Retry all</button>
      <button onClick={cleanAllFailed}>Clean all</button>
    </div>
  ),
  delayed: ({ cleanAllDelayed }: any) => (
    <button onClick={cleanAllDelayed}>Clean all</button>
  ),
}

const isStatusActionable = (status: Status): status is Actionable =>
  status in actions

const QueueActions = (props: QueueActionProps) => {
  const { status } = props

  if (!isStatusActionable(status)) {
    return <div />
  }

  const Actions = actions[status]

  return (
    <div>
      <Actions {...props} />
    </div>
  )
}

interface QueueProps {
  queue: AppQueue
  selectedStatus: Status
  selectStatus: (statuses: Record<string, Status>) => void
  cleanAllDelayed: () => Promise<void>
  cleanAllFailed: () => Promise<void>
  retryAll: () => Promise<void>
  retryJob: (job: AppJob) => () => Promise<void>
}

// REVIEW: this is in place so we can manipulate the return type
//  of Object.keys which is string[] by default
// We need to extend so babel doesn't think it's JSX
const keysOf = <Target extends {}>(target: Target) =>
  Object.keys(target) as (keyof Target)[]

export const Queue = ({
  cleanAllDelayed,
  cleanAllFailed,
  queue,
  retryAll,
  retryJob,
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
          queue={queue}
          status={selectedStatus}
        />
        <Jobs retryJob={retryJob} queue={queue} status={selectedStatus} />
      </>
    )}
  </section>
)
