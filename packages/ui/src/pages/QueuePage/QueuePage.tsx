import { STATUSES } from '@bull-board/api/src/constants/statuses';
import { JobRetryStatus } from '@bull-board/api/typings/app';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { JobCard } from '../../components/JobCard/JobCard';
import { Pagination } from '../../components/Pagination/Pagination';
import { QueueActions } from '../../components/QueueActions/QueueActions';
import { StatusMenu } from '../../components/StatusMenu/StatusMenu';
import { StickyHeader } from '../../components/StickyHeader/StickyHeader';
import { useActiveQueue } from '../../hooks/useActiveQueue';
import { useJob } from '../../hooks/useJob';
import { useQueues } from '../../hooks/useQueues';
import { useSelectedStatuses } from '../../hooks/useSelectedStatuses';
import { links } from '../../utils/links';

export const QueuePage = () => {
  const { t } = useTranslation();
  const selectedStatus = useSelectedStatuses();
  const { actions } = useQueues();
  const { actions: jobActions } = useJob();
  const queue = useActiveQueue();
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
        <StatusMenu queue={queue} actions={actions} />
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
          }}
          readOnlyMode={queue?.readOnlyMode}
          allowRetries={(job.isFailed || queue.allowCompletedRetries) && queue.allowRetries}
        />
      ))}
    </section>
  );
};
