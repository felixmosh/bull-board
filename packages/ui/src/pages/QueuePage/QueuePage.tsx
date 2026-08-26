import { STATUSES } from '@bull-board/api/constants/statuses';
import type { AppJob } from '@bull-board/api/typings/app';
import React, { Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { SchedulersIcon } from '../../components/Icons/Schedulers';
import { JobCard } from '../../components/JobCard/JobCard';
import { Loader } from '../../components/Loader/Loader';
import { Pagination } from '../../components/Pagination/Pagination';
import { QueueActions } from '../../components/QueueActions/QueueActions';
import { QueueDropdownActions } from '../../components/QueueDropdownActions/QueueDropdownActions';
import { RateLimitBadge } from '../../components/RateLimitBadge/RateLimitBadge';
import { StatusMenu } from '../../components/StatusMenu/StatusMenu';
import { StickyHeader } from '../../components/StickyHeader/StickyHeader';
import { WorkersBadge } from '../../components/WorkersBadge/WorkersBadge';
import { useActiveQueue } from '../../hooks/useActiveQueue';
import { useJob } from '../../hooks/useJob';
import { useModal } from '../../hooks/useModal';
import { useQueues } from '../../hooks/useQueues';
import { useSelectedStatuses } from '../../hooks/useSelectedStatuses';
import { useUIConfig } from '../../hooks/useUIConfig';
import { links } from '../../utils/links';
import s from './QueuePage.module.css';

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

const RateLimitModalLazy = React.lazy(() =>
  import('../../components/RateLimitModal/RateLimitModal').then(({ RateLimitModal }) => ({
    default: RateLimitModal,
  }))
);

const EditJobModalLazy = React.lazy(() =>
  import('../../components/EditJobModal/EditJobModal').then(({ EditJobModal }) => ({
    default: EditJobModal,
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
  const modal = useModal<
    'addJob' | 'updateJobData' | 'concurrency' | 'rescheduleJob' | 'reprioritiseJob' | 'rateLimit'
  >();
  const [editJob, setEditJob] = useState<AppJob | null>(null);

  if (!queue) {
    return <section>{loading ? <Loader /> : t('QUEUE.NOT_FOUND')}</section>;
  }

  const status = selectedStatus[queue.name];
  const isLatest = status === STATUSES.latest;
  const schedulerCount = queue.jobSchedulerCount ?? 0;

  return (
    <section>
      <StickyHeader
        actions={
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

            <Pagination pageCount={queue.pagination.pageCount} />
          </>
        }
      >
        <StatusMenu queue={queue}>
          {schedulerCount > 0 && (
            <Link
              className={s.schedulersLink}
              to={links.jobSchedulers({ queueName: queue.name })}
              aria-label={t('QUEUE.SCHEDULERS_LINK', { count: schedulerCount })}
            >
              <SchedulersIcon />
              <span className={s.schedulersLabel}>{t('SCHEDULERS.TITLE')}</span>
              <span className={s.schedulersCount}>{schedulerCount}</span>
            </Link>
          )}
          <RateLimitBadge queue={queue} />
          <WorkersBadge queue={queue} />
          {!queue.readOnlyMode && (
            <QueueDropdownActions
              queue={queue}
              actions={{
                ...actions,
                addJob: () => modal.open('addJob'),
                onConcurrency: () => modal.open('concurrency'),
                onRateLimit: () => modal.open('rateLimit'),
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
              rescheduleJob: () => {
                setEditJob(job);
                modal.open('rescheduleJob');
              },
              reprioritiseJob: () => {
                setEditJob(job);
                modal.open('reprioritiseJob');
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
            color: 'var(--muted-foreground)',
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
        {modal.isMounted('rateLimit') && (
          <RateLimitModalLazy
            open={modal.isOpen('rateLimit')}
            onClose={modal.close('rateLimit')}
            queue={queue}
          />
        )}
        {modal.isMounted('rescheduleJob') && !!editJob && (
          <EditJobModalLazy
            open={modal.isOpen('rescheduleJob')}
            field="delay"
            job={editJob}
            onSubmit={(runAt) => jobActions.changeJobDelay(queue.name, editJob, runAt)()}
            onClose={() => {
              setEditJob(null);
              modal.close('rescheduleJob')();
            }}
          />
        )}
        {modal.isMounted('reprioritiseJob') && !!editJob && (
          <EditJobModalLazy
            open={modal.isOpen('reprioritiseJob')}
            field="priority"
            job={editJob}
            onSubmit={(priority) => jobActions.changeJobPriority(queue.name, editJob, priority)()}
            onClose={() => {
              setEditJob(null);
              modal.close('reprioritiseJob')();
            }}
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
