import { STATUSES } from '@bull-board/api/dist/src/constants/statuses';
import { JobRetryStatus } from '@bull-board/api/typings/app';
import React from 'react';
import { JobCard } from '../../components/JobCard/JobCard';
import { Pagination } from '../../components/Pagination/Pagination';
import { QueueActions } from '../../components/QueueActions/QueueActions';
import { StatusMenu } from '../../components/StatusMenu/StatusMenu';
<<<<<<< HEAD
import { Store } from '../../hooks/useStore';
import s from './QueuePage.module.css';
import { InputField } from '../../components/Form/InputField/InputField';
import { useSearchPromptStore } from '../../hooks/useSearchPrompt';
=======
import { StickyHeader } from '../../components/StickyHeader/StickyHeader';
import { useActiveQueue } from '../../hooks/useActiveQueue';
import { useJob } from '../../hooks/useJob';
import { useQueues } from '../../hooks/useQueues';
import { useSelectedStatuses } from '../../hooks/useSelectedStatuses';
import { links } from '../../utils/links';
>>>>>>> upstream/master

export const QueuePage = () => {
  const selectedStatus = useSelectedStatuses();
  const { actions, queues } = useQueues();
  const { actions: jobActions } = useJob();
  const queue = useActiveQueue({ queues });
  actions.pollQueues();

  if (!queue) {
    return <section>Queue Not found</section>;
  }

  const status = selectedStatus[queue.name];
  const isLatest = status === STATUSES.latest;

  const {searchPrompt, setSearchPrompt} = useSearchPromptStore((state) => state);

  return (
    <section>
      <StickyHeader
        actions={
          <>
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
          </>
        }
      >
        <StatusMenu queue={queue} actions={actions} />
<<<<<<< HEAD
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
            <form onSubmit={(event) => {
              event.preventDefault();
              setSearchPrompt(event.currentTarget.filter.value);
            }}>
            <InputField
              placeholder="Filter"
              id="filter"
              name="filter"
              defaultValue={searchPrompt}
            />
            </form>
          </div>
          <Pagination pageCount={queue.pagination.pageCount} />
        </div>
      </div>
=======
      </StickyHeader>
>>>>>>> upstream/master
      {queue.jobs.map((job) => (
        <JobCard
          key={job.id}
          job={job}
          jobUrl={links.jobPage(queue.name, `${job.id}`, selectedStatus)}
          status={isLatest && job.isFailed ? STATUSES.failed : status}
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
