import { useParams, useHistory, useLocation } from 'react-router-dom';
import { AppJob, AppQueue, JobRetryStatus, Status } from '@bull-board/api/typings/app';
import React, { useState } from 'react';
import { Store } from '../../hooks/useStore';
import s from '../QueuePage/QueuePage.module.css';
import { JobCard } from '../../components/JobCard/JobCard';
import { ArrowLeftIcon } from '../../components/Icons/ArrowLeft';
import { Button } from '../../components/JobCard/Button/Button';
import { useInterval } from '../../hooks/useInterval';

export const JobPage = ({
  actions,
  queue,
  selectedStatus,
}: {
  queue: AppQueue | null;
  actions: Store['actions'];
  selectedStatus: Store['selectedStatuses'];
}) => {
  const { search } = useLocation();
  const history = useHistory();
  const { name, jobId } = useParams<any>();
  const [job, setJob] = useState<AppJob>();
  const [status, setStatus] = useState<Status>(selectedStatus[queue?.name || '']);

  useInterval(() => {
    fetchJob();
  }, 5000);

  const fetchJob = async () => {
    const { job, state } = await actions.getJob(name)(jobId)();
    setJob(job);
    setStatus(state);
  };

  if (!queue) {
    return <section>Queue Not found</section>;
  }

  if (!job) {
    return <section>Job Not found</section>;
  }

  const cleanJob = async () => {
    await actions.cleanJob(queue?.name)(job)();
    history.push(`/queue/${queue.name}`);
  };

  return (
    <section>
      <div className={s.stickyHeader}>
        <div className={s.actionContainer}>
          <Button onClick={() => history.push(`/queue/${queue.name}${search}`)}>
            <ArrowLeftIcon />
          </Button>
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
