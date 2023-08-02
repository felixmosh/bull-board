import { AppQueue, JobRetryStatus } from '@bull-board/api/typings/app';
import React from 'react';
import { JobCard } from '../../components/JobCard/JobCard';
import { Pagination } from '../../components/Pagination/Pagination';
import { QueueActions } from '../../components/QueueActions/QueueActions';
import { StatusMenu } from '../../components/StatusMenu/StatusMenu';
import { Store } from '../../hooks/useStore';
import s from './QueuePage.module.css';
import { InputField } from '../../components/Form/InputField/InputField';

export const QueuePage = ({
  selectedStatus,
  actions,
  queue,
}: {
  queue: AppQueue | null;
  actions: Store['actions'];
  selectedStatus: Store['selectedStatuses'];
}) => {
  if (!queue) {
    return <section>Queue Not found</section>;
  }

  const status = selectedStatus[queue.name];

  const [searchPrompt, setSearchPrompt] = React.useState<string>('');

  const filteredJobs = searchPrompt.length > 0
    ? queue.jobs.filter(
        (job) =>
          job.id?.toString().toLocaleLowerCase().includes(searchPrompt) ||
          (JSON.stringify(job?.data).toLocaleLowerCase().includes(searchPrompt))
      )
    : queue.jobs;
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
            <InputField
              placeholder="Filter"
              id="filter"
              onChange={(e) => setSearchPrompt(e.target.value.toLowerCase())}       
            />
            {}
          </div>
          <Pagination pageCount={queue.pagination.pageCount} />
        </div>
      </div>
      { filteredJobs.map((job) => (
        <JobCard
          key={job.id}
          job={job}
          status={status}
          actions={{
            cleanJob: actions.cleanJob(queue?.name)(job),
            promoteJob: actions.promoteJob(queue?.name)(job),
            retryJob: actions.retryJob(queue?.name, status as JobRetryStatus)(job),
            getJobLogs: actions.getJobLogs(queue?.name)(job),
          }}
          readOnlyMode={queue?.readOnlyMode}
          allowRetries={(job.isFailed || queue.allowCompletedRetries) && queue?.allowRetries}
        />
      ))}
    </section>
  );
};
