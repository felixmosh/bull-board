import { errorResponse } from '../errors';
import { BaseAdapter } from '../queueAdapters/base';
import type { GetQueuesQuery } from '../schemas/requests';
import { GetQueuesResponse } from '../schemas/responses';
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
} from '../types';
import { InvalidSearchPatternError, searchJobs } from './jobSearch';

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
    ? statuses.reduce((total, status) => total + Math.min(counts[status] ?? 0, jobsPerPage), 0)
    : (counts[statuses[0]] ?? 0);

  const start = isLatestStatus ? 0 : (currentPage - 1) * jobsPerPage;
  const pageCount = isLatestStatus ? 1 : Math.ceil(total / jobsPerPage);

  return {
    pageCount,
    range: { start, end: start + jobsPerPage - 1 },
  };
}

async function getAppQueues(
  pairs: [string, BaseAdapter][],
  query: GetQueuesQuery
): Promise<AppQueue[]> {
  return Promise.all(
    pairs.map(async ([queueName, queue]) => {
      const isActiveQueue = decodeURIComponent(query.activeQueue ?? '') === queueName;
      const jobsPerPage = query.jobsPerPage;

      const jobStatuses = queue.getJobStatuses();

      const status =
        !isActiveQueue || query.status === 'latest' || !query.status
          ? jobStatuses
          : [query.status as JobStatus];
      const currentPage = query.page;

      const [counts, isPaused, globalConcurrency, activeRateLimitTtl, jobSchedulerCount] =
        await Promise.all([
          queue.getJobCounts(),
          queue.isPaused(),
          queue.getGlobalConcurrency(),
          queue.getActiveRateLimitTtl().catch(() => 0),
          queue.getJobSchedulersCount(),
        ]);

      const search = isActiveQueue ? query.search?.trim() : undefined;
      let pagination: Pagination;
      let jobs: AppJob[];
      let searchResult: AppQueue['search'];

      if (search) {
        const found = await searchJobs(queue, status, counts, { ...query, search }, (job) =>
          formatJob(job, queue)
        );
        const start = (currentPage - 1) * jobsPerPage;
        pagination = {
          pageCount: Math.ceil(found.jobs.length / jobsPerPage),
          range: { start, end: start + jobsPerPage - 1 },
        };
        jobs = found.jobs.slice(start, start + jobsPerPage);
        searchResult = found.result;
      } else {
        pagination = getPagination(status, counts, currentPage, jobsPerPage);
        jobs = isActiveQueue
          ? (await queue.getJobs(status, pagination.range.start, pagination.range.end))
              .filter(Boolean)
              .map((job) => formatJob(job, queue))
          : [];
      }

      return {
        name: queueName,
        displayName: queue.getDisplayName() || undefined,
        description: queue.getDescription() || undefined,
        statuses: queue.getStatuses(),
        counts,
        jobs,
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
        ...(searchResult ? { search: searchResult } : {}),
      } satisfies AppQueue;
    })
  );
}

export async function queuesHandler(
  req: BullBoardRequest<GetQueuesQuery>
): Promise<ControllerHandlerReturnType<GetQueuesResponse>> {
  const pairs: [string, BaseAdapter][] = [];

  for (const [queueName, queue] of req.queues.entries()) {
    if (await queue.isVisible(req)) {
      pairs.push([queueName, queue]);
    }
  }

  let queues: AppQueue[] = [];
  try {
    queues = pairs.length > 0 ? await getAppQueues(pairs, req.query) : [];
  } catch (error) {
    if (error instanceof InvalidSearchPatternError) {
      return errorResponse(400, 'ERRORS.INVALID_SEARCH_PATTERN', { message: error.message });
    }
    throw error;
  }

  return {
    body: {
      queues,
    },
  };
}
