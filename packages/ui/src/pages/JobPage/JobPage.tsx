import { JobRetryStatus } from '@bull-board/api/typings/app';
import cn from 'clsx';
import React, { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useHistory } from 'react-router-dom';
import { ArrowLeftIcon } from '../../components/Icons/ArrowLeft';
import { JobCard } from '../../components/JobCard/JobCard';
import { StickyHeader } from '../../components/StickyHeader/StickyHeader';
import { useActiveQueue } from '../../hooks/useActiveQueue';
import { useJob } from '../../hooks/useJob';
import { useModal } from '../../hooks/useModal';
import { useSelectedStatuses } from '../../hooks/useSelectedStatuses';
import { links } from '../../utils/links';
import buttonS from '../../components/Button/Button.module.css';

const AddJobModalLazy = React.lazy(() =>
  import('../../components/AddJobModal/AddJobModal').then(({ AddJobModal }) => ({
    default: AddJobModal,
  }))
);

const UpdateJobDataModalLazy = React.lazy(() =>
  import('../../components/UpdateJobDataModal/UpdateJobDataModal').then(
    ({ UpdateJobDataModal }) => ({
      default: UpdateJobDataModal,
    })
  )
);

export const JobPage = () => {
  const { t } = useTranslation();
  const history = useHistory();

  const queue = useActiveQueue();
  const { job, status, actions } = useJob();
  const selectedStatuses = useSelectedStatuses();
  const modal = useModal<'updateJobData' | 'addJob'>();

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
          updateJobData: () => modal.open('updateJobData'),
          duplicateJob: () => modal.open('addJob'),
        }}
        readOnlyMode={queue.readOnlyMode}
        allowRetries={(job.isFailed || queue.allowCompletedRetries) && queue.allowRetries}
      />
      <Suspense fallback={null}>
        {modal.isMounted('addJob') && (
          <AddJobModalLazy
            open={modal.isOpen('addJob')}
            onClose={modal.close('addJob')}
            job={job}
          />
        )}
        {modal.isMounted('updateJobData') && (
          <UpdateJobDataModalLazy
            open={modal.isOpen('updateJobData')}
            onClose={modal.close('updateJobData')}
            job={job}
          />
        )}
      </Suspense>
    </section>
  );
};
