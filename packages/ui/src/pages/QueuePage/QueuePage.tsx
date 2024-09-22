import { STATUSES } from '@bull-board/api/src/constants/statuses';
import { AppJob, JobRetryStatus } from '@bull-board/api/typings/app';
import React, { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { JobCard } from '../../components/JobCard/JobCard';
import { Pagination } from '../../components/Pagination/Pagination';
import { QueueActions } from '../../components/QueueActions/QueueActions';
import { QueueDropdownActions } from '../../components/QueueDropdownActions/QueueDropdownActions';
import { StatusMenu } from '../../components/StatusMenu/StatusMenu';
import { StickyHeader } from '../../components/StickyHeader/StickyHeader';
import { useActiveQueue } from '../../hooks/useActiveQueue';
import { useJob } from '../../hooks/useJob';
import { useModal } from '../../hooks/useModal';
import { useQueues } from '../../hooks/useQueues';
import { useSelectedStatuses } from '../../hooks/useSelectedStatuses';
import { links } from '../../utils/links';

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

export const QueuePage = () => {
  const { t } = useTranslation();
  const selectedStatus = useSelectedStatuses();
  const { actions } = useQueues();
  const { actions: jobActions } = useJob();
  const queue = useActiveQueue();
  const modal = useModal<'addJob' | 'updateJobData'>();
  const [editJob, setEditJob] = React.useState<AppJob | null>(null);

  actions.pollQueues();

  if (!queue) {
    return <section>{t('QUEUE.NOT_FOUND')}</section>;
  }

  const status = selectedStatus[queue.name];
  const isLatest = status === STATUSES.latest;

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
        <StatusMenu queue={queue}>
          {!queue.readOnlyMode && (
            <QueueDropdownActions
              queue={queue}
              actions={{ ...actions, addJob: () => modal.open('addJob') }}
            />
          )}
        </StatusMenu>
      </StickyHeader>
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
            updateJobData: () => {
              setEditJob(job);
              modal.open('updateJobData');
            },
            duplicateJob: () => {
              setEditJob(job);
              modal.open('addJob');
            },
          }}
          readOnlyMode={queue?.readOnlyMode}
          allowRetries={(job.isFailed || queue.allowCompletedRetries) && queue.allowRetries}
        />
      ))}
      <Suspense fallback={null}>
        {modal.isMounted('addJob') && (
          <AddJobModalLazy
            open={modal.isOpen('addJob')}
            onClose={modal.close('addJob')}
            job={editJob}
          />
        )}
        {modal.isMounted('updateJobData') && !!editJob && (
          <UpdateJobDataModalLazy
            open={modal.isOpen('updateJobData')}
            onClose={() => {
              setEditJob(null);
              modal.close('updateJobData');
            }}
            job={editJob}
          />
        )}
      </Suspense>
    </section>
  );
};
