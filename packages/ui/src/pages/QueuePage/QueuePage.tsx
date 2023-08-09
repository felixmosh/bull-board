import { JobRetryStatus } from '@bull-board/api/typings/app';
import React from 'react';
import { useLocation } from 'react-router-dom';
import { JobCard } from '../../components/JobCard/JobCard';
import { Pagination } from '../../components/Pagination/Pagination';
import { QueueActions } from '../../components/QueueActions/QueueActions';
import { StatusMenu } from '../../components/StatusMenu/StatusMenu';
import { useActiveQueue } from '../../hooks/useActiveQueue';
import { useJob } from '../../hooks/useJob';
import { useQueues } from '../../hooks/useQueues';
import { useSelectedStatuses } from '../../hooks/useSelectedStatuses';
import s from './QueuePage.module.css';

export const QueuePage = () => {
  const selectedStatus = useSelectedStatuses();
  const { actions, queues } = useQueues();
  const { actions: jobActions } = useJob();
  const queue = useActiveQueue({ queues });
  const { search } = useLocation();
  actions.pollQueues();

  if (!queue) {
    return <section>Queue Not found</section>;
  }

  const status = selectedStatus[queue.name];

  return (
    <section>
      <div className={s.stickyHeader}>
        <StatusMenu queue={queue} actions={actions} />
        <div className={s.actionContainer}>
          <div>
            {queue.jobs.length > 0 && !queue.readOnlyMode && (
              <QueueActions
                queue={queue}
                actions={actions}
                status={selectedStatus[queue.name]}
                allowRetries={
                  (selectedStatus[queue.name] == 'failed' || queue.allowCompletedRetries) &&
                  queue.allowRetries
                }
              />
            )}
          </div>
          <Pagination pageCount={queue.pagination.pageCount} />
        </div>
      </div>
      {queue.jobs.map((job) => (
        <JobCard
          key={job.id}
          job={job}
          jobUrlPath={`/queue/${encodeURIComponent(queue.name)}/${encodeURIComponent(
            job.id ?? ''
          )}${search}`}
          status={status}
          actions={{
            cleanJob: jobActions.cleanJob(queue.name)(job),
            promoteJob: jobActions.promoteJob(queue.name)(job),
            retryJob: jobActions.retryJob(queue.name, status as JobRetryStatus)(job),
            getJobLogs: jobActions.getJobLogs(queue.name)(job),
          }}
          readOnlyMode={queue?.readOnlyMode}
          allowRetries={(job.isFailed || queue.allowCompletedRetries) && queue.allowRetries}
        />
      ))}
    </section>
  );
};
