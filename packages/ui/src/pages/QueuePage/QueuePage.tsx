import { AppQueue, JobRetryStatus } from '@bull-board/api/typings/app';
import React from 'react';
import { useLocation } from 'react-router-dom';
import { JobCard } from '../../components/JobCard/JobCard';
import { Pagination } from '../../components/Pagination/Pagination';
import { QueueActions } from '../../components/QueueActions/QueueActions';
import { StatusMenu } from '../../components/StatusMenu/StatusMenu';
import { Store } from '../../hooks/useStore';
import s from './QueuePage.module.css';
import { InputField } from '../../components/Form/InputField/InputField';
import { useSearchPromptStore } from '../../hooks/useSearchPrompt';

export const QueuePage = ({
  selectedStatus,
  actions,
  queue,
}: {
  queue: AppQueue | null;
  actions: Store['actions'];
  selectedStatus: Store['selectedStatuses'];
}) => {
  const { search } = useLocation();

  if (!queue) {
    return <section>Queue Not found</section>;
  }

  const status = selectedStatus[queue.name];

  const {searchPrompt, setSearchPrompt} = useSearchPromptStore((state) => state);

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
              defaultValue={searchPrompt}
              onBlur={(event) => setSearchPrompt(event.target.value)}
              onKeyDown={(event) => {
                if(event.key === 'Enter'){
                  (event.target as HTMLElement).blur()
                }
              }}
            />
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
