import { JobRetryStatus } from '@bull-board/api/typings/app';
import cn from 'clsx';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useHistory } from 'react-router-dom';
import { ArrowLeftIcon } from '../../components/Icons/ArrowLeft';
import { JobCard } from '../../components/JobCard/JobCard';
import { StickyHeader } from '../../components/StickyHeader/StickyHeader';
import { useActiveQueue } from '../../hooks/useActiveQueue';
import { useJob } from '../../hooks/useJob';
import { useSelectedStatuses } from '../../hooks/useSelectedStatuses';
import { links } from '../../utils/links';
import buttonS from '../../components/Button/Button.module.css';

export const JobPage = () => {
  const { t } = useTranslation();
  const history = useHistory();

  const queue = useActiveQueue();
  const { job, status, actions } = useJob();
  const selectedStatuses = useSelectedStatuses();

  actions.pollJob();

  if (!queue) {
    return <section>{t('QUEUE.NOT_FOUND')}</section>;
  }

  if (!job) {
    return <section>{t('JOB.NOT_FOUND')}</section>;
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
            <div> {t('JOB.STATUS', { status: status.toLocaleUpperCase() })}</div>
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
