import { STATUSES } from '@bull-board/api/src/constants/statuses';
import { AppJob, Status } from '@bull-board/api/typings/app';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Card } from '../Card/Card';
import { Details } from './Details/Details';
import { JobActions } from './JobActions/JobActions';
import s from './JobCard.module.css';
import { Progress } from './Progress/Progress';
import { Timeline } from './Timeline/Timeline';

interface JobCardProps {
  job: AppJob;
  jobUrl?: string;
  status: Status;
  readOnlyMode: boolean;
  allowRetries: boolean;
  actions: {
    promoteJob: () => Promise<void>;
    retryJob: () => Promise<void>;
    cleanJob: () => Promise<void>;
    getJobLogs: () => Promise<string[]>;
  };
}

const greenStatuses = [STATUSES.active, STATUSES.completed];

export const JobCard = ({
  job,
  status,
  actions,
  readOnlyMode,
  allowRetries,
  jobUrl,
}: JobCardProps) => {
  const { t } = useTranslation();
  return (
    <Card className={s.card}>
      <div className={s.sideInfo}>
        {jobUrl ? (
          <Link className={s.jobLink} to={jobUrl}>
            <span title={`#${job.id}`}>#{job.id}</span>
          </Link>
        ) : (
          <span title={`#${job.id}`}>#{job.id}</span>
        )}
        <Timeline job={job} status={status} />
      </div>
      <div className={s.contentWrapper}>
        <div className={s.title}>
          <h4>
            {job.name}
            {job.attempts > 1 && <span>{t('JOB.ATTEMPTS', { attempts: job.attempts })}</span>}
            {!!job.opts?.repeat?.count && (
              <span>
                {t(`JOB.REPEAT${!!job.opts?.repeat?.limit ? '_WITH_LIMIT' : ''}`, {
                  count: job.opts.repeat.count,
                  limit: job.opts?.repeat?.limit,
                })}
              </span>
            )}
          </h4>
          {!readOnlyMode && (
            <JobActions status={status} actions={actions} allowRetries={allowRetries} />
          )}
        </div>
        <div className={s.content}>
          <Details status={status} job={job} actions={actions} />
          {typeof job.progress === 'number' && (
            <Progress
              percentage={job.progress}
              status={
                job.isFailed && !greenStatuses.includes(status as any) ? STATUSES.failed : status
              }
              className={s.progress}
            />
          )}
        </div>
      </div>
    </Card>
  );
};
