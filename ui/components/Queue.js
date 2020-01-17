import React, { useState } from 'react'
import {
  getYear,
  format,
  isToday,
  formatDistance,
  formatDistanceStrict,
} from 'date-fns'
import Highlight from 'react-highlight/lib/optimized'

const today = new Date()

function formatDate(ts) {
  if (isToday(ts)) {
    return format(ts, 'HH:mm:ss')
  }

  return getYear(ts) === getYear(today)
    ? format(ts, 'MM/dd HH:mm:ss')
    : format(ts, 'MM/dd/yyyy HH:mm:ss')
}

function TS({ ts, prev }) {
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

function MenuItem({ status, count, onClick, selected }) {
  return (
    <div
      className={`menu-item ${status} ${selected ? 'selected' : ''} ${
        count === 0 ? 'off' : 'on'
      }`}
      onClick={onClick}
    >
      {status !== 'latest' && <b className="count">{count}</b>} {status}
    </div>
  )
}

const statuses = [
  'latest',
  'active',
  'waiting',
  'completed',
  'failed',
  'delayed',
  'paused',
]

const fields = {
  latest: ['id', 'timestamps', 'name', 'progress', 'attempts', 'data', 'opts'],
  completed: [
    'id',
    'timestamps',
    'name',
    'progress',
    'attempts',
    'data',
    'opts',
  ],
  delayed: ['id', 'timestamps', 'name', 'attempts', 'delay', 'data', 'opts'],
  paused: ['id', 'timestamps', 'name', 'attempts', 'data', 'opts'],
  active: ['id', 'timestamps', 'name', 'progress', 'attempts', 'data', 'opts'],
  waiting: ['id', 'timestamps', 'name', 'data', 'opts'],
  failed: [
    'id',
    'failedReason',
    'name',
    'timestamps',
    'progress',
    'attempts',
    'retry',
  ],
}

function PlusIcon({ width = 18 }) {
  return (
    <svg
      width={width}
      style={{ verticalAlign: 'middle' }}
      viewBox="0 0 14 14"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="7"
        cy="7"
        r="6"
        stroke="none"
        strokeWidth="2"
        fill="#f4f4f8"
      />

      <line x1="4" y1="7" x2="10" y2="7" stroke="#333" strokeWidth="1" />
      <line x1="7" y1="4" x2="7" y2="10" stroke="#333" strokeWidth="1" />
    </svg>
  )
}

function PlayIcon({ width = 18 }) {
  return (
    <svg
      width={width}
      style={{ verticalAlign: 'middle' }}
      viewBox="0 0 14 14"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="7"
        cy="7"
        r="6"
        stroke="none"
        strokeWidth="2"
        fill="#f4f4f8"
      />

      <line x1="5" y1="5" x2="9" y2="7" stroke="#333" strokeWidth="1" />
      <line x1="9" y1="7" x2="5" y2="9" stroke="#333" strokeWidth="1" />
    </svg>
  )
}

function CheckIcon({ width = 18 }) {
  return (
    <svg
      width={width}
      style={{ verticalAlign: 'middle' }}
      viewBox="0 0 14 14"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="7"
        cy="7"
        r="6"
        stroke="none"
        strokeWidth="2"
        fill="#f4f4f8"
      />

      <circle cx="7" cy="7" r="2" stroke="#333" strokeWidth="1" fill="none" />
    </svg>
  )
}

const fieldComponents = {
  id: ({ job }) => {
    return <b>#{job.id}</b>
  },
  timestamps: ({ job }) => {
    return (
      <div className="timestamps">
        <div>
          <PlusIcon /> <TS ts={job.timestamp} />
        </div>
        {job.processedOn && (
          <div>
            <PlayIcon /> <TS ts={job.processedOn} prev={job.timestamp} />
          </div>
        )}
        {job.finishedOn && (
          <div>
            <CheckIcon /> <TS ts={job.finishedOn} prev={job.processedOn} />
          </div>
        )}
      </div>
    )
  },
  name: ({ job }) => {
    if (job.name === '__default__') {
      return '--'
    }
    return job.name
  },
  finish: ({ job }) => {
    return <TS ts={job.finishedOn} prev={job.processedOn} />
  },
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
        return '--'
    }
  },
  attempts: ({ job }) => {
    return job.attempts
  },
  delay: ({ job }) => {
    return formatDistanceStrict(job.timestamp + job.delay, Date.now())
  },
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
  opts: ({ job }) => {
    return (
      <Highlight className="json">
        {JSON.stringify(job.opts, null, 2)}
      </Highlight>
    )
  },
  retry: ({ retryJob }) => {
    return <button onClick={retryJob}>Retry</button>
  },
}

function Jobs({ retryJob, queue: { jobs, name }, status }) {
  if (!jobs.length) {
    return `No jobs with status ${status}`
  }

  return (
    <table>
      <thead>
        <tr>
          {fields[status].map(field => (
            <th key={field}>{field}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {jobs.map(job => {
          return (
            <tr key={job.id}>
              {fields[status].map(field => {
                const Field = fieldComponents[field]
                return (
                  <td key={`${name}-${job.id}-${field}`}>
                    <Field job={job} retryJob={retryJob(job)} />
                  </td>
                )
              })}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

const actions = {
  failed: ({ retryAll, cleanAllFailed }) => {
    return (
      <div>
        <button onClick={retryAll}>Retry all</button>
        <button onClick={cleanAllFailed}>Clean all</button>
      </div>
    )
  },
  delayed: ({ cleanAllDelayed }) => {
    return <button onClick={cleanAllDelayed}>Clean all</button>
  },
}

function QueueActions(props) {
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

export default function Queue({
  retryAll,
  retryJob,
  cleanAllDelayed,
  cleanAllFailed,
  queue,
  selectStatus,
  selectedStatus,
}) {
  return (
    <section>
      <h3>
        {queue.name}
        {queue.version === 4 && <small> bullmq</small>}
      </h3>
      <div className="menu-list">
        {statuses.map(status => (
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
}
