import { AppQueue } from '../../../@types/app'
import { JobCard } from '../JobCard/JobCard'
import { QueueActions } from '../QueueActions/QueueActions'
import React from 'react'
import { StatusMenu } from '../StatusMenu/StatusMenu'
import { Store } from '../../hooks/useStore'
import s from './QueuePage.module.css'

export const QueuePage = ({
  selectedStatus,
  actions,
  queue,
}: {
  queue: AppQueue | undefined
  actions: Store['actions']
  selectedStatus: Store['selectedStatuses']
}) => {
  if (!queue) {
    return <section>Queue Not found</section>
  }

  return (
    <section>
      <div className={s.stickyHeader}>
        <StatusMenu
          queue={queue}
          selectedStatus={selectedStatus}
          onChange={actions.setSelectedStatuses}
        />
        <QueueActions
          queue={queue}
          actions={actions}
          status={selectedStatus[queue.name]}
        />
      </div>
      {queue.jobs.map((job) => (
        <JobCard
          key={job.id}
          queueName={queue.name}
          job={job}
          status={selectedStatus[queue.name]}
          actions={{
            cleanJob: actions.cleanJob(queue?.name)(job),
            promoteJob: actions.promoteJob(queue?.name)(job),
            retryJob: actions.retryJob(queue?.name)(job),
          }}
        />
      ))}
    </section>
  )
}
