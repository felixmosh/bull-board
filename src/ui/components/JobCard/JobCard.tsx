import { AppJob } from '../../../@types/app'
import { Details } from './Details/Details'
import { JobActions } from './JobActions/JobActions'
import { Progress } from './Progress/Progress'
import React from 'react'
import { Status } from '../constants'
import { Timeline } from './Timeline/Timeline'
import s from './JobCard.module.css'

interface JobCardProps {
  job: AppJob
  status: Status
  queueName: string
  actions: {
    promoteJob: () => Promise<void>
    retryJob: () => Promise<void>
    cleanJob: () => Promise<void>
  }
}

export const JobCard = ({ job, queueName, status, actions }: JobCardProps) => (
  <div className={s.card}>
    <div className={s.sideInfo}>
      <span title={`#${job.id}`}>#{job.id}</span>
      <Timeline job={job} status={status} />
    </div>
    <div className={s.contentWrapper}>
      <div className={s.title}>
        <h4>
          {job.name}
          {job.attempts > 0 && <span>attempt #{job.attempts + 1}</span>}
        </h4>
        <JobActions status={status} actions={actions} />
      </div>
      <div className={s.content}>
        <Details status={status} job={job} queueName={queueName} />
        {typeof job.progress === 'number' && (
          <Progress
            percentage={job.progress}
            status={status}
            className={s.progress}
          />
        )}
      </div>
    </div>
  </div>
)
