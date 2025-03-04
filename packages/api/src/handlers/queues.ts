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
import { BullMQSearch } from './jobSearch';

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

async function getAppQueues(
  pairs: [string, BaseAdapter][],
  query: Record<string, any>
): Promise<AppQueue[]> {
  return Promise.all(
    pairs.map(async ([queueName, queue]) => {
      const isActiveQueue = decodeURIComponent(query.activeQueue) === queueName;
      const jobsPerPage = +query.jobsPerPage || 10;
      const searchQuery = query.search;
      const searchField = query.searchField || 'data'; // default to searching in data

      const jobStatuses = queue.getJobStatuses();

      const status =
        !isActiveQueue || query.status === 'latest' ? jobStatuses : [query.status as JobStatus];
      const currentPage = +query.page || 1;

      const counts = await queue.getJobCounts();
      const isPaused = await queue.isPaused();

      const pagination = getPagination(status, counts, currentPage, jobsPerPage);
      
      let jobs: any[] = [];
      
      // Use search functionality if search query is provided and queue is active
      if (isActiveQueue && searchQuery) {
        // Get Redis options from the queue adapter if possible
        // This might require modifying the BaseAdapter to expose Redis options
        const redisOptions = queue.getRedisOptions ? await queue.getRedisOptions() : {};
        const bullMQSearch = new BullMQSearch(queueName, {
          prefix: queue.prefix || 'bull',
          //@ts-ignore
          redis: redisOptions.options
        });
        
        try {
          let searchResult;
          if (searchField === 'name') {
            searchResult = await bullMQSearch.searchByName(searchQuery, {
              limit: jobsPerPage,
              cursor: (currentPage > 1) ? `${(currentPage - 1) * jobsPerPage}` : "0"
            });
          } else {
            searchResult = await bullMQSearch.searchByData(searchQuery, {
              limit: jobsPerPage,
              cursor: (currentPage > 1) ? `${(currentPage - 1) * jobsPerPage}` : "0"
            });
          }
          
          // Convert search results to QueueJob format expected by formatJob
          jobs = searchResult.items.map(item => {
            // You might need to adapt the search results to match what formatJob expects
            // This is a simplified version - you may need to adjust based on actual structure
            return {
              toJSON: () => ({
                id: item.id,
                timestamp: item.timestamp,
                processedOn: item.processedOn,
                finishedOn: item.finishedOn,
                progress: item.progress,
                opts: item.opts,
                data: item.data,
                name: item.name,
              })
            };
          });
          
          // Update pagination based on search results
          pagination.pageCount = searchResult.hasMore ? currentPage + 1 : currentPage;
          
          await bullMQSearch.close();
        } catch (error) {
          console.error('Search error:', error);
          // Fallback to regular getJobs in case of search error
          jobs = await queue.getJobs(status, pagination.range.start, pagination.range.end);
        }
      } else if (isActiveQueue) {
        // Use the original getJobs if no search query
        jobs = await queue.getJobs(status, pagination.range.start, pagination.range.end);
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
