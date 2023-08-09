import { AppQueue, JobRetryStatus } from '@bull-board/api/typings/app';
import React from 'react';
import { Link, useHistory, useLocation } from 'react-router-dom';
import { ArrowLeftIcon } from '../../components/Icons/ArrowLeft';
import { JobCard } from '../../components/JobCard/JobCard';
import { useJob } from '../../hooks/useJob';
import s from '../QueuePage/QueuePage.module.css';

export const JobPage = ({ queue }: { queue: AppQueue | null }) => {
  const { search } = useLocation();
  const history = useHistory();
  const { job, status, actions } = useJob();

  actions.pollJob();

  if (!queue) {
    return <section>Queue Not found</section>;
  }

  if (!job) {
    return <section>Job Not found</section>;
  }

  const cleanJob = async () => {
    await actions.cleanJob(queue?.name)(job)();
    history.replace(`/queue/${queue.name}`);
  };

  return (
    <section>
      <div className={s.stickyHeader}>
        <div className={s.actionContainer}>
          <Link to={`/queue/${queue.name}${search}`}>
            <ArrowLeftIcon />
          </Link>
          <div>Status: {status.toLocaleUpperCase()}</div>
        </div>
      </div>
      <JobCard
        key={job.id}
        job={job}
        status={status}
        actions={{
          cleanJob,
          promoteJob: actions.promoteJob(queue?.name)(job),
          retryJob: actions.retryJob(queue?.name, status as JobRetryStatus)(job),
          getJobLogs: actions.getJobLogs(queue?.name)(job),
        }}
        readOnlyMode={queue?.readOnlyMode}
        allowRetries={(job.isFailed || queue.allowCompletedRetries) && queue?.allowRetries}
      />
    </section>
  );
};
