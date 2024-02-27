import { STATUSES } from '@bull-board/api/src/constants/statuses';
import { AppJob, Status } from '@bull-board/api/typings/app';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Card } from '../Card/Card';
import { ArrowDownIcon } from '../Icons/ArrowDownIcon';
import { useSettingsStore } from '../../hooks/useSettings';
import { ArrowUpIcon } from '../Icons/ArrowUpIcon';
import { Button } from '../Button/Button';
import * as Collapsible from '@radix-ui/react-collapsible';
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
  const { collapseJob } = useSettingsStore();

  const [isOpen, setIsOpen] = React.useState<boolean>();

  React.useEffect(() => {
    if (isOpen === undefined)
      setIsOpen(!jobUrl ? true : !collapseJob)
  }), [];

  const JobTitle = <h4 title={`#${job.id}`}>#{job.id}</h4>

  return (
    <Card className={s.card}>
      <Collapsible.Root style={{ width: '100%' }} open={isOpen}>
        <div className={s.header}>
          {jobUrl ? (
            <Link className={s.jobLink} to={jobUrl}>
              {JobTitle}
            </Link>
          ) : JobTitle}

          {jobUrl && (
            <Button className={s.collapseBtn} onClick={() => setIsOpen(!isOpen)}>
              {isOpen ? <ArrowUpIcon /> : <ArrowDownIcon />}
            </Button>
          )}
        </div>

        <Collapsible.Content>
          <div className={s.details}>
            <div className={s.sideInfo}>
              <Timeline job={job} status={status} />
            </div>

            <div className={s.contentWrapper}>
              <div className={s.title}>
                <h5>
                  {t('JOB.NAME')}: {job.name}
                  {job.attempts > 1 && (
                    <span style={{ marginLeft: '0.5rem' }}>
                      - {t('JOB.ATTEMPTS', { attempts: job.attempts })}
                    </span>
                  )}

                  {!!job.opts?.repeat?.count && (
                    <span>
                      {t(`JOB.REPEAT${!!job.opts?.repeat?.limit ? '_WITH_LIMIT' : ''}`, {
                        count: job.opts.repeat.count,
                        limit: job.opts?.repeat?.limit,
                      })}
                    </span>
                  )}
                </h5>

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
          </div>
        </Collapsible.Content>
      </Collapsible.Root>
    </Card>
  );
};
