import React, { useState } from 'react'
import { formatDistanceStrict } from 'date-fns'
import Highlight from 'react-highlight'
import { AppJob } from '../../@types/app'
import { Field, FIELDS, Status } from './constants'
import { PlusIcon } from './PlusIcon'
import { PlayIcon } from './PlayIcon'
import { CheckIcon } from './CheckIcon'
import { Timestamp } from './Timestamp'

type FieldProps = {
  job: AppJob
  retryJob: () => Promise<void>
  delayedJob: () => Promise<void>
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
    <>
      {formatDistanceStrict(
        Number(job.timestamp || 0) + Number(job.delay || 0),
        Date.now(),
      )}
    </>
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

  promote: ({ delayedJob }) => <button onClick={delayedJob}>Promote</button>,
}

export const Job = ({
  job,
  status,
  queueName,
  retryJob,
  promoteJob,
}: {
  job: AppJob
  status: Status
  queueName: string
  retryJob: (job: AppJob) => () => Promise<void>
  promoteJob: (job: AppJob) => () => Promise<void>
}) => {
  return (
    <tr>
      {FIELDS[status].map(field => {
        const Field = fieldComponents[field]

        return (
          <td key={`${queueName}-${job.id}-${field}`}>
            <Field
              job={job}
              retryJob={retryJob(job)}
              delayedJob={promoteJob(job)}
            />
          </td>
        )
      })}
    </tr>
  )
}
