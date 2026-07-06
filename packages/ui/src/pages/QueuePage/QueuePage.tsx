import { STATUSES } from '@bull-board/api/constants/statuses';
import type { AppJob } from '@bull-board/api/typings/app';
import React, { Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { JobCard } from '../../components/JobCard/JobCard';
import { Loader } from '../../components/Loader/Loader';
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
import { useUIConfig } from '../../hooks/useUIConfig';
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

const ConcurrencyModalLazy = React.lazy(() =>
  import('../../components/ConcurrencyModal/ConcurrencyModal').then(({ ConcurrencyModal }) => ({
    default: ConcurrencyModal,
  }))
);

const QueueMetricsLazy = React.lazy(() =>
  import('../../components/QueueMetrics/QueueMetrics').then(({ QueueMetrics }) => ({
    default: QueueMetrics,
  }))
);

export const QueuePage = () => {
  const { t } = useTranslation();
  const { showMetrics = false } = useUIConfig();
  const selectedStatus = useSelectedStatuses();
  const { actions, loading, isTransitioning } = useQueues();
  const { actions: jobActions } = useJob();
  const queue = useActiveQueue();
  const modal = useModal<'addJob' | 'updateJobData' | 'concurrency'>();
  const [editJob, setEditJob] = useState<AppJob | null>(null);

  if (!queue) {
    return <section>{loading ? <Loader /> : t('QUEUE.NOT_FOUND')}</section>;
  }

  const status = selectedStatus[queue.name];
  const isLatest = status === STATUSES.latest;

  return (
    <section>
      <StickyHeader
        actions={
          <>
            <>
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
            </>
            <Pagination pageCount={queue.pagination.pageCount} />
          </>
        }
      >
        <StatusMenu queue={queue}>
          {!queue.readOnlyMode && (
            <QueueDropdownActions
              queue={queue}
              actions={{
                ...actions,
                addJob: () => modal.open('addJob'),
                onConcurrency: () => modal.open('concurrency'),
              }}
            />
          )}
        </StatusMenu>
      </StickyHeader>
      {showMetrics && (
        <Suspense fallback={null}>
          <QueueMetricsLazy queue={queue} />
        </Suspense>
      )}
      {isTransitioning ? (
        <Loader />
      ) : queue.jobs.length > 0 ? (
        queue.jobs.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            jobUrl={links.jobPage(queue.name, `${job.id}`, selectedStatus)}
            status={isLatest && job.isFailed ? STATUSES.failed : status}
            actions={{
              cleanJob: jobActions.cleanJob(queue.name)(job),
              promoteJob: jobActions.promoteJob(queue.name)(job),
              retryJob: jobActions.retryJob(queue.name)(job),
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
        ))
      ) : (
        <p
          style={{
            textAlign: 'center',
            color: 'var(--accent-color)',
            fontSize: '0.9rem',
            marginTop: '2rem',
          }}
        >
          {t('QUEUE.EMPTY_STATE', { status })}
        </p>
      )}
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
        {modal.isMounted('concurrency') && (
          <ConcurrencyModalLazy
            open={modal.isOpen('concurrency')}
            onClose={modal.close('concurrency')}
            queue={queue}
          />
        )}
      </Suspense>
    </section>
  );
};
