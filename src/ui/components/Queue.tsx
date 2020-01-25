import React, { useState } from 'react'
import {
  getYear,
  format,
  isToday,
  formatDistance,
  formatDistanceStrict,
} from 'date-fns'
import Highlight from 'react-highlight'
import { Job } from 'bull'
import { Job as JobMq } from 'bullmq'

import { FIELDS, STATUSES } from './constants'

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

const Timestamp = ({ ts, prev }: { ts?: TimeStamp; prev?: TimeStamp }) => {
  if (ts === undefined) {
    // REVIEW: what should be the timestamp for undefined?
    //  Currently we're passing `job.finishedOn` to this component, which might be undefined
    return null
  }

  const date = formatDate(ts)

  return (
    <>
      {date}{' '}
      {ts && prev && (
        <>
          <small>({formatDistance(ts, prev, { includeSeconds: true })})</small>
        </>
      )}
    </>
  )
}

// FIXME: typings
const MenuItem = ({ status, count, onClick, selected }: any) => (
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

const fieldComponents = {
  id: ({ job }: { job: Job | JobMq }) => <b>#{job.id}</b>,

  timestamps: ({ job }: { job: Job | JobMq }) => (
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

  name: ({ job }: { job: Job | JobMq }) =>
    job.name === '__default__' ? '--' : job.name,

  finish: ({ job }: { job: Job | JobMq }) => (
    <Timestamp ts={job.finishedOn} prev={job.processedOn} />
  ),

  progress: ({ job }: { job: Job | JobMq }) => {
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
        return '--'
    }
  },

  // FIXME: typings
  attempts: ({ job }: { job: any }) => job.attempts,

  // FIXME: typings
  delay: ({ job }: { job: any }) =>
    formatDistanceStrict(job.timestamp + job.delay, Date.now()),

  // FIXME: typings
  failedReason: ({ job }: any) => {
    return (
      <>
        {job.failedReason || 'NA'}
        <Highlight className="javascript">{job.stacktrace}</Highlight>
      </>
    )
  },

  data: ({ job }: { job: Job | JobMq }) => {
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

  opts: ({ job }: { job: Job | JobMq }) => (
    <Highlight className="json">{JSON.stringify(job.opts, null, 2)}</Highlight>
  ),

  // FIXME: typings
  retry: ({ retryJob }: { retryJob: () => void }) => (
    <button onClick={retryJob}>Retry</button>
  ),
}

const Jobs = ({
  retryJob,
  queue: { jobs, name },
  status,
}: {
  // FIXME: typings
  retryJob: any
  queue: {
    jobs: any
    name: any
  }
  status: string
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
        {jobs.map((job: Job | JobMq) => (
          <tr key={job.id}>
            {FIELDS[status].map(field => {
              // FIXME: typings
              // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
              // @ts-ignore
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

const actions = {
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

// FIXME: typings
const QueueActions = (props: {
  [key: string]: any
  status: 'failed' | 'delayed'
}) => {
  const Actions =
    actions[props.status] ||
    (() => {
      return null
    })

  return (
    <div>
      <Actions {...props} />
    </div>
  )
}

// FIXME: typings
export const Queue = ({
  cleanAllDelayed,
  cleanAllFailed,
  queue,
  retryAll,
  retryJob,
  selectedStatus,
  selectStatus,
}: any) => (
  <section>
    <h3>
      {queue.name}
      {queue.version === 4 && <small> bullmq</small>}
    </h3>
    <div className="menu-list">
      {Object.keys(STATUSES).map(status => (
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
