import { AppQueue, JobRetryStatus } from '@bull-board/api/typings/app';
import cn from 'clsx';
import React from 'react';
import { Link, useHistory } from 'react-router-dom';
import { ArrowLeftIcon } from '../../components/Icons/ArrowLeft';
import { JobCard } from '../../components/JobCard/JobCard';
import { StickyHeader } from '../../components/StickyHeader/StickyHeader';
import { useJob } from '../../hooks/useJob';
import { useSelectedStatuses } from '../../hooks/useSelectedStatuses';
import { links } from '../../utils/links';
import buttonS from '../../components/Button/Button.module.css';

export const JobPage = ({ queue }: { queue: AppQueue | null }) => {
  const history = useHistory();
  const { job, status, actions } = useJob();
  const selectedStatuses = useSelectedStatuses();

  actions.pollJob();

  if (!queue) {
    return <section>Queue Not found</section>;
  }

  if (!job) {
    return <section>Job Not found</section>;
  }

  const cleanJob = async () => {
    await actions.cleanJob(queue.name)(job)();
    history.replace(links.queuePage(queue.name, selectedStatuses));
  };

  return (
    <section>
      <StickyHeader
        actions={
          <>
            <Link
              className={cn(buttonS.button, buttonS.default)}
              to={links.queuePage(queue.name, selectedStatuses)}
            >
              <ArrowLeftIcon />
            </Link>
            <div>Status: {status.toLocaleUpperCase()}</div>
          </>
        }
      />
      <JobCard
        key={job.id}
        job={job}
        status={status}
        actions={{
          cleanJob,
          promoteJob: actions.promoteJob(queue.name)(job),
          retryJob: actions.retryJob(queue.name, status as JobRetryStatus)(job),
          getJobLogs: actions.getJobLogs(queue.name)(job),
        }}
        readOnlyMode={queue.readOnlyMode}
        allowRetries={(job.isFailed || queue.allowCompletedRetries) && queue.allowRetries}
      />
    </section>
  );
};
