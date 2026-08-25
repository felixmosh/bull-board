import {
  AppJob,
  AppQueue,
  BullBoardRequest,
  ControllerHandlerReturnType,
  JobCounts,
  JobStatus,
  Pagination,
  QueueJob,
  QueueJobJson,
  Status,
} from '../../typings/app';
import { BaseAdapter } from '../queueAdapters/base';

function pickSetDiagnostics(job: QueueJobJson) {
  const { priority, attemptsStarted, stalledCounter, deduplicationId, deferredFailure } = job;
  const startsDiverged = !!attemptsStarted && attemptsStarted > job.attemptsMade;

  return {
    ...(priority ? { priority } : {}),
    ...(startsDiverged ? { attemptsStarted } : {}),
    ...(stalledCounter ? { stalledCounter } : {}),
    ...(deduplicationId ? { deduplicationId } : {}),
    ...(deferredFailure ? { deferredFailure } : {}),
  };
}

export const formatJob = (job: QueueJob, queue: BaseAdapter): AppJob => {
  const jobProps = job.toJSON();

  const stacktrace = jobProps.stacktrace ? jobProps.stacktrace.filter(Boolean) : [];
  stacktrace.reverse();

  return {
    id: jobProps.id,
    timestamp: jobProps.timestamp,
    processedOn: jobProps.processedOn,
    processedBy: jobProps.processedBy,
    finishedOn: jobProps.finishedOn,
    progress: queue.format('progress', jobProps.progress),
    attempts: jobProps.attemptsMade,
    delay: jobProps.delay,
    failedReason: jobProps.failedReason,
    stacktrace,
    opts: jobProps.opts,
    data: queue.format('data', jobProps.data),
    name: queue.format('name', jobProps, jobProps.name || ''),
    returnValue: queue.format('returnValue', jobProps.returnvalue),
    isFailed: !!jobProps.failedReason || (Array.isArray(stacktrace) && stacktrace.length > 0),
    externalUrl:
      typeof queue.externalJobUrl === 'function' ? queue.externalJobUrl(jobProps) : undefined,
    groupId: jobProps.opts?.group?.id,
    ...pickSetDiagnostics(jobProps),
  };
};

function getPagination(
  statuses: JobStatus[],
  counts: JobCounts,
  currentPage: number,
  jobsPerPage: number
): Pagination {
  const isLatestStatus = statuses.length > 1;
  const total = isLatestStatus
    ? statuses.reduce((total, status) => total + Math.min(counts[status], jobsPerPage), 0)
    : counts[statuses[0]];

  const start = isLatestStatus ? 0 : (currentPage - 1) * jobsPerPage;
  const pageCount = isLatestStatus ? 1 : Math.ceil(total / jobsPerPage);

  return {
    pageCount,
    range: { start, end: start + jobsPerPage - 1 },
  };
}

/**
 * Whether anything is consuming the queue, for the warning the board shows when nothing is.
 * A queue whose Redis is unreachable reports "unknown" rather than taking the whole board down
 * with it, so one bad connection does not cost every other queue its listing.
 */
async function getHasWorkers(queue: BaseAdapter, showWorkers: boolean): Promise<boolean | null> {
  if (!showWorkers) {
    return null;
  }

  const workers = await queue.getWorkers().catch(() => null);
  return workers && workers.length > 0;
}

async function getAppQueues(
  pairs: [string, BaseAdapter][],
  query: Record<string, any>,
  showWorkers: boolean
): Promise<AppQueue[]> {
  return Promise.all(
    pairs.map(async ([queueName, queue]) => {
      const isActiveQueue = decodeURIComponent(query.activeQueue) === queueName;
      const jobsPerPage = +query.jobsPerPage || 10;

      const jobStatuses = queue.getJobStatuses();

      const status =
        !isActiveQueue || query.status === 'latest' ? jobStatuses : [query.status as JobStatus];
      const currentPage = +query.page || 1;

      const [
        counts,
        isPaused,
        globalConcurrency,
        activeRateLimitTtl,
        jobSchedulerCount,
        hasWorkers,
      ] = await Promise.all([
        queue.getJobCounts(),
        queue.isPaused(),
        queue.getGlobalConcurrency(),
        queue.getActiveRateLimitTtl().catch(() => 0),
        queue.getJobSchedulersCount(),
        getHasWorkers(queue, showWorkers),
      ]);

      const pagination = getPagination(status, counts, currentPage, jobsPerPage);
      const jobs = isActiveQueue
        ? await queue.getJobs(status, pagination.range.start, pagination.range.end)
        : [];

      return {
        name: queueName,
        displayName: queue.getDisplayName() || undefined,
        description: queue.getDescription() || undefined,
        statuses: queue.getStatuses(),
        counts: counts as Record<Status, number>,
        jobs: jobs.filter(Boolean).map((job) => formatJob(job, queue)),
        pagination,
        readOnlyMode: queue.readOnlyMode,
        allowRetries: queue.allowRetries,
        allowCompletedRetries: queue.allowCompletedRetries,
        isPaused,
        type: queue.type,
        delimiter: queue.delimiter,
        globalConcurrency,
        activeRateLimitTtl,
        supportsGlobalRateLimit: queue.supportsGlobalRateLimit,
        jobSchedulerCount,
        hasWorkers,
      } satisfies AppQueue;
    })
  );
}

export async function queuesHandler(req: BullBoardRequest): Promise<ControllerHandlerReturnType> {
  const pairs: [string, BaseAdapter][] = [];

  for (const [queueName, queue] of req.queues.entries()) {
    if (await queue.isVisible(req)) {
      pairs.push([queueName, queue]);
    }
  }

  const queues =
    pairs.length > 0
      ? await getAppQueues(pairs, req.query, req.uiConfig?.showWorkers !== false)
      : [];

  return {
    body: {
      queues,
    },
  };
}
