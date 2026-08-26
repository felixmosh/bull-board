import cn from 'clsx';
import React, { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useHistory } from 'react-router-dom';
import { ArrowLeftIcon } from '../../components/Icons/ArrowLeft';
import { JobCard } from '../../components/JobCard/JobCard';
import { JobFlow } from '../../components/JobFlow/JobFlow';
import { Loader } from '../../components/Loader/Loader';
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

const EditJobModalLazy = React.lazy(() =>
  import('../../components/EditJobModal/EditJobModal').then(({ EditJobModal }) => ({
    default: EditJobModal,
  }))
);

export const JobPage = () => {
  const { t } = useTranslation();
  const history = useHistory();

  const queue = useActiveQueue();
  const { job, status, actions, loading, isTransitioning } = useJob();
  const selectedStatuses = useSelectedStatuses();
  const modal = useModal<'updateJobData' | 'addJob' | 'rescheduleJob' | 'reprioritiseJob'>();

  if (!queue) {
    return <section>{t('QUEUE.NOT_FOUND')}</section>;
  }

  if (!job) {
    return <section>{loading ? <Loader /> : t('JOB.NOT_FOUND')}</section>;
  }

  const cleanJob = async () => {
    await actions.cleanJob(queue.name)(job)();
    history.replace(links.queuePage(queue.name, selectedStatuses));
  };

  return (
    <section>
      <StickyHeader
        actions={
          <Link
            className={cn(buttonS.button, buttonS.default)}
            to={links.queuePage(queue.name, selectedStatuses)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4em' }}
          >
            <ArrowLeftIcon />
            {queue.name}
          </Link>
        }
      />
      {isTransitioning ? (
        <Loader />
      ) : (
        <JobCard
          key={job.id}
          job={job}
          status={status}
          actions={{
            cleanJob,
            promoteJob: actions.promoteJob(queue.name)(job),
            retryJob: actions.retryJob(queue.name)(job),
            getJobLogs: actions.getJobLogs(queue.name)(job),
            updateJobData: () => modal.open('updateJobData'),
            duplicateJob: () => modal.open('addJob'),
            rescheduleJob: () => modal.open('rescheduleJob'),
            reprioritiseJob: () => modal.open('reprioritiseJob'),
          }}
          readOnlyMode={queue.readOnlyMode}
          allowRetries={(job.isFailed || queue.allowCompletedRetries) && queue.allowRetries}
        />
      )}
      <JobFlow />
      <Suspense fallback={null}>
        {modal.isMounted('addJob') && (
          <AddJobModalLazy
            open={modal.isOpen('addJob')}
            onClose={modal.close('addJob')}
            job={job}
          />
        )}
        {modal.isMounted('rescheduleJob') && (
          <EditJobModalLazy
            open={modal.isOpen('rescheduleJob')}
            field="delay"
            job={job}
            onSubmit={(runAt) => actions.changeJobDelay(queue.name, job, runAt)()}
            onClose={modal.close('rescheduleJob')}
          />
        )}
        {modal.isMounted('reprioritiseJob') && (
          <EditJobModalLazy
            open={modal.isOpen('reprioritiseJob')}
            field="priority"
            job={job}
            onSubmit={(priority) => actions.changeJobPriority(queue.name, job, priority)()}
            onClose={modal.close('reprioritiseJob')}
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
