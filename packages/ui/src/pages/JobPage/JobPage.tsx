import { useParams, useHistory, useLocation } from 'react-router-dom';
import { AppJob, AppQueue, Status } from '@bull-board/api/typings/app';
import React, { useEffect, useRef, useState } from 'react';
import { Store } from '../../hooks/useStore';
import s from '../QueuePage/QueuePage.module.css';
import { JobCard } from '../../components/JobCard/JobCard';
import { ArrowLeftIcon } from '../../components/Icons/ArrowLeft';
import { Button } from '../../components/JobCard/Button/Button';

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
  const { name, jobId } = useParams<any>();
  const [job, setJob] = useState<AppJob>();
  const [jobState, setJobState] = useState<Status>(selectedStatus[queue?.name || '']);
  const intervalRef = useRef<NodeJS.Timeout | null>();
  const history = useHistory();

  const fetchJob = async () => {
    const jobResponse = await actions.getJob(name)(jobId)();
    setJob(jobResponse[jobId]);
  };

  const pollForJob = () => {
    if (!!intervalRef.current) return;
    fetchJob();

    intervalRef.current = setInterval(() => {
      fetchJob();
    }, 5000);
  };

  const retryJob = async () => {
    if (!queue || !job) return;

    await actions.retryJob(queue?.name, 'failed')(job)();
    setJobState('active');
    pollForJob();
  };

  const cleanJob = async () => {
    if (!queue || !job) return;

    await actions.cleanJob(queue?.name)(job)();
    history.push(`/queue/${queue.name}`);
  };

  useEffect(() => {
    if (!queue || !job) return;

    if (jobState === 'active') {
      // transition from active to completed
      if (job?.progress === 100 && !job.failedReason) {
        setJobState('completed');
        history.push(`/queue/${queue.name}?status=completed`);
      }
      // transition from active to failed
      else if (!!job?.failedReason) {
        setJobState('failed');
      }
      // navigated to an active job
      else {
        pollForJob();
      }
    }
  }, [job]);

  useEffect(() => {
    if (!queue || !job) return;

    const queryStringStatus = selectedStatus[queue?.name];
    setJobState(queryStringStatus);
  }, []);

  useEffect(() => {
    fetchJob();

    return () => {
      clearInterval(intervalRef.current as NodeJS.Timeout);
    };
  }, []);

  if (!queue) {
    return <section>Queue Not found</section>;
  }

  if (!job) {
    return <section>Job Not found</section>;
  }

  return (
    <section>
      <div className={s.stickyHeader}>
        <div className={s.actionContainer}>
          <Button onClick={() => history.push(`/queue/${queue.name}${search}`)}>
            <ArrowLeftIcon />
          </Button>
          <div>Status: {jobState.toLocaleUpperCase()}</div>
        </div>
      </div>
      <JobCard
        key={job.id}
        job={job}
        status={jobState}
        actions={{
          cleanJob,
          promoteJob: actions.promoteJob(queue?.name)(job),
          retryJob,
          getJobLogs: actions.getJobLogs(queue?.name)(job),
        }}
        readOnlyMode={queue?.readOnlyMode}
        allowRetries={(job.isFailed || queue.allowCompletedRetries) && queue?.allowRetries}
      />
    </section>
  );
};
