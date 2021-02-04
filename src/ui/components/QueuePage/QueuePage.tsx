import React from 'react'
import { AppQueue } from '../../../@types/app'
import { Store } from '../../hooks/useStore'
import { JobCard } from '../JobCard/JobCard'
import { QueueActions } from '../QueueActions/QueueActions'
import { StatusMenu } from '../StatusMenu/StatusMenu'
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
        {!queue.readOnlyMode && (
          <QueueActions
            queue={queue}
            actions={actions}
            status={selectedStatus[queue.name]}
          />
        )}
      </div>
      {queue.jobs.map((job) => (
        <JobCard
          key={job.id}
          job={job}
          status={selectedStatus[queue.name]}
          actions={{
            cleanJob: actions.cleanJob(queue?.name)(job),
            promoteJob: actions.promoteJob(queue?.name)(job),
            retryJob: actions.retryJob(queue?.name)(job),
          }}
          readOnlyMode={queue?.readOnlyMode}
        />
      ))}
    </section>
  )
}
