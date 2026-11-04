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
import {
  compileSearch,
  InvalidSearchExpressionError,
  matchesSearch,
  SearchExpression,
  searchJobs,
} from './jobFilters';

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

/** The active queue's page of jobs, after the job id, search and order filters. */
async function getActiveJobs(
  queue: BaseAdapter,
  statuses: JobStatus[],
  counts: JobCounts,
  query: GetQueuesQuery,
  expression: SearchExpression | null
): Promise<{ jobs: AppJob[]; pagination: Pagination; search?: AppQueue['search'] }> {
  const { jobsPerPage, page } = query;
  const format = (job: QueueJob) => formatJob(job, queue);
  const jobId = query.jobId?.trim();

  // An id is unique, so it is one read; it still has to be in the selected status (and match
  // the search, when there is one) to be shown.
  if (jobId) {
    const job = await queue.getJob(jobId).catch(() => null);
    const state = job ? await job.getState().catch(() => null) : null;
    const formatted = job && state && (statuses as string[]).includes(state) ? format(job) : null;
    const matched =
      formatted && job && (!expression || (await matchesSearch(expression, job, formatted)));
    const jobs = matched && formatted ? [formatted] : [];
    return {
      jobs,
      pagination: { pageCount: 1, range: { start: 0, end: jobsPerPage - 1 } },
      search: { matched: jobs.length, scanned: job ? 1 : 0, truncated: false },
    };
  }

  if (expression) {
    const found = await searchJobs(queue, statuses, counts, expression, query.order, format);
    const start = (page - 1) * jobsPerPage;
    return {
      jobs: found.jobs.slice(start, start + jobsPerPage),
      pagination: {
        pageCount: Math.ceil(found.jobs.length / jobsPerPage),
        range: { start, end: start + jobsPerPage - 1 },
      },
      search: found.result,
    };
  }

  const pagination = getPagination(statuses, counts, page, jobsPerPage);
  const jobs = await queue.getJobs(
    statuses,
    pagination.range.start,
    pagination.range.end,
    query.order === 'asc'
  );
  return { jobs: jobs.filter(Boolean).map(format), pagination };
}

async function getAppQueues(
  pairs: [string, BaseAdapter][],
  query: GetQueuesQuery,
  expression: SearchExpression | null
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

      const active = isActiveQueue
        ? await getActiveJobs(queue, status, counts, query, expression)
        : { jobs: [], pagination: getPagination(status, counts, currentPage, jobsPerPage) };

      return {
        name: queueName,
        displayName: queue.getDisplayName() || undefined,
        description: queue.getDescription() || undefined,
        statuses: queue.getStatuses(),
        counts,
        jobs: active.jobs,
        pagination: active.pagination,
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
        ...(active.search ? { search: active.search } : {}),
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

  let expression: SearchExpression | null = null;
  const search = req.query.search?.trim();
  if (search) {
    try {
      expression = compileSearch(search);
    } catch (error) {
      if (error instanceof InvalidSearchExpressionError) {
        return errorResponse(400, 'ERRORS.INVALID_SEARCH_EXPRESSION', { message: error.message });
      }
      throw error;
    }
  }

  const queues = pairs.length > 0 ? await getAppQueues(pairs, req.query, expression) : [];

  return {
    body: {
      queues,
    },
  };
}
