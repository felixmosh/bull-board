import React from 'react'
import { Status, FIELDS } from './constants'
import { AppJob, AppQueue } from '../../@types/app'
import { Job } from './Job'

export const Jobs = ({
  retryJob,
  cleanJob,
  promoteJob,
  queue: { jobs, name },
  status,
}: {
  retryJob: (job: AppJob) => () => Promise<void>
  cleanJob: (job: AppJob) => () => Promise<void>
  promoteJob: (job: AppJob) => () => Promise<void>
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
          <Job
            key={job.id}
            job={job}
            status={status}
            queueName={name}
            retryJob={retryJob}
            cleanJob={cleanJob}
            promoteJob={promoteJob}
          />
        ))}
      </tbody>
    </table>
  )
}
