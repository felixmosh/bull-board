import {
  AppJob,
  AppQueue,
  BullBoardRequest,
  ControllerHandlerReturnType,
  JobCounts,
  JobStatus,
  Pagination,
  QueueJob,
  Status,
} from '../../typings/app';
import { BaseAdapter } from '../queueAdapters/base';

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
    progress: jobProps.progress,
    attempts: jobProps.attemptsMade,
    delay: jobProps.delay,
    failedReason: jobProps.failedReason,
    stacktrace,
    opts: jobProps.opts,
    data: queue.format('data', jobProps.data),
    name: queue.format('name', jobProps, jobProps.name || ''),
    returnValue: queue.format('returnValue', jobProps.returnvalue),
    isFailed: !!jobProps.failedReason || (Array.isArray(stacktrace) && stacktrace.length > 0),
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

const SEARCH_BATCH_SIZE = 1000;

async function searchJobs(
  queue: BaseAdapter,
  status: JobStatus[],
  searchText: string
): Promise<QueueJob[]> {
  // Try exact ID match first
  try {
    const job = await queue.getJob(searchText);
    if (job) {
      return [job];
    }
  } catch (error) {
    // Continue with text search if ID lookup fails
  }

  const matchingJobs: QueueJob[] = [];
  let start = 0;
  let batchJobs: QueueJob[] = [];

  do {
    batchJobs = await queue.getJobs(status, start, start + SEARCH_BATCH_SIZE - 1);
    if (!batchJobs.length) break;

    for (const job of batchJobs) {
      const jobProps = job.toJSON();
      const jobData = JSON.stringify(jobProps.data || {}).toLowerCase();
      const jobId = String(jobProps.id).toLowerCase();
      const jobName = (jobProps.name || '').toLowerCase();
      const searchLower = searchText.toLowerCase();

      if (
        jobData.includes(searchLower) ||
        jobId.includes(searchLower) ||
        jobName.includes(searchLower)
      ) {
        matchingJobs.push(job);
      }
    }

    start += SEARCH_BATCH_SIZE;
  } while (batchJobs.length === SEARCH_BATCH_SIZE && matchingJobs.length < SEARCH_BATCH_SIZE);

  return matchingJobs;
}

async function getAppQueues(
  pairs: [string, BaseAdapter][],
  query: Record<string, any>
): Promise<AppQueue[]> {
  const searchText = query.search || '';

  return Promise.all(
    pairs.map(async ([queueName, queue]) => {
      const isActiveQueue = decodeURIComponent(query.activeQueue) === queueName;
      const jobsPerPage = +query.jobsPerPage || 10;

      const jobStatuses = queue.getJobStatuses();

      const status =
        !isActiveQueue || query.status === 'latest' ? jobStatuses : [query.status as JobStatus];
      const currentPage = +query.page || 1;

      const counts = await queue.getJobCounts();
      const isPaused = await queue.isPaused();

      let jobs: QueueJob[] = [];
      let pagination = getPagination(status, counts, currentPage, jobsPerPage);

      if (isActiveQueue) {
        if (searchText) {
          // When searching, we load jobs differently
          jobs = await searchJobs(queue, status, searchText);

          // Adjust pagination for search results
          pagination = {
            pageCount: Math.ceil(jobs.length / jobsPerPage),
            range: {
              start: (currentPage - 1) * jobsPerPage,
              end: currentPage * jobsPerPage - 1,
            },
          };

          // Slice jobs for current page
          jobs = jobs.slice(pagination.range.start, pagination.range.end + 1);
        } else {
          // Normal pagination when not searching
          jobs = await queue.getJobs(status, pagination.range.start, pagination.range.end);
        }
      }

      return {
        name: queueName,
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
      };
    })
  );
}

export async function queuesHandler({
  queues: bullBoardQueues,
  query = {},
}: BullBoardRequest): Promise<ControllerHandlerReturnType> {
  const pairs = [...bullBoardQueues.entries()];

  const queues = pairs.length > 0 ? await getAppQueues(pairs, query) : [];

  return {
    body: {
      queues,
    },
  };
}
