import { parse as parseRedisInfo } from 'redis-info';
import { BaseAdapter } from '../queueAdapters/base';
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
  ValidMetrics,
} from '../../typings/app';
import { STATUSES } from '../constants/statuses';

type MetricName = keyof ValidMetrics;

const metrics: MetricName[] = [
  'redis_version',
  'used_memory',
  'mem_fragmentation_ratio',
  'connected_clients',
  'blocked_clients',
];

const getStats = async (queue: BaseAdapter): Promise<ValidMetrics> => {
  const redisInfoRaw = await queue.getRedisInfo();
  const redisInfo = parseRedisInfo(redisInfoRaw);

  const validMetrics = metrics.reduce((acc, metric) => {
    if (redisInfo[metric]) {
      acc[metric] = redisInfo[metric];
    }

    return acc;
  }, {} as Record<MetricName, string>);

  validMetrics.total_system_memory = redisInfo.total_system_memory || redisInfo.maxmemory;

  return validMetrics;
};

const truncate = function (dataToTruncate: any, curDepth = 0): any {
  if (dataToTruncate === undefined) {
    return undefined;
  }
  if (dataToTruncate === null) {
    return null;
  }
  if (curDepth < 4) {
    const newDepth = curDepth + 1
    const json: any = Object.assign({}, dataToTruncate);
    Object.entries(dataToTruncate).forEach(([key, value]) => {
      switch (typeof value) {
        case "string":
          json[key] = value.length > 10000 ? "[String-Truncated]" : value;
          break;
        case "object":
          if (Array.isArray(value)) {
            json[key] = JSON.stringify(value).length > 10000 ? "[Array-Truncated]" : value;
          } else {
            json[key] =  truncate(value, newDepth);
          }
          break;
        default:
          json[key] = value;
          break;
      }
    });
    return json;
  }
  return "[Object-Truncated]";
}

const formatJob = (job: QueueJob, queue: BaseAdapter): AppJob => {
  const jobProps = job.toJSON();

  const stacktrace = jobProps.stacktrace ? jobProps.stacktrace.filter(Boolean) : [];

  return {
    id: jobProps.id,
    timestamp: jobProps.timestamp,
    processedOn: jobProps.processedOn,
    finishedOn: jobProps.finishedOn,
    progress: jobProps.progress,
    attempts: jobProps.attemptsMade,
    delay: job.opts.delay,
    failedReason: jobProps.failedReason,
    stacktrace,
    opts: jobProps.opts,
    data: queue.format('data', truncate(jobProps.data)),
    name: queue.format('name', jobProps, jobProps.name),
    returnValue: queue.format('returnValue', truncate(jobProps.returnvalue)),
    isFailed: !!jobProps.failedReason || (Array.isArray(stacktrace) && stacktrace.length > 0),
  };
};

const allStatuses: JobStatus[] = [
  STATUSES.active,
  STATUSES.completed,
  STATUSES.delayed,
  STATUSES.failed,
  STATUSES.paused,
  STATUSES.waiting,
];
const JOB_PER_PAGE = 10;

function getPagination(statuses: JobStatus[], counts: JobCounts, currentPage: number): Pagination {
  const isLatestStatus = statuses.length > 1;
  const total = isLatestStatus
    ? statuses.reduce((total, status) => total + Math.min(counts[status], JOB_PER_PAGE), 0)
    : counts[statuses[0]];

  const start = isLatestStatus ? 0 : (currentPage - 1) * JOB_PER_PAGE;
  const pageCount = isLatestStatus ? 1 : Math.ceil(total / JOB_PER_PAGE);

  return {
    pageCount,
    range: { start, end: start + JOB_PER_PAGE - 1 },
  };
}

async function getAppQueues(
  pairs: [string, BaseAdapter][],
  query: Record<string, any>
): Promise<AppQueue[]> {
  return Promise.all(
    pairs.map(async ([queueName, queue]) => {
      const isActiveQueue = decodeURIComponent(query.activeQueue) === queueName;

      const status =
        !isActiveQueue || query.status === 'latest' ? allStatuses : [query.status as JobStatus];
      const currentPage = +query.page || 1;

      const counts = await queue.getJobCounts(...allStatuses);
      const isPaused = await queue.isPaused();

      const pagination = getPagination(status, counts, currentPage);
      const jobs = isActiveQueue
        ? await queue.getJobs(status, pagination.range.start, pagination.range.end)
        : [];

      return {
        name: queueName,
        counts: counts as Record<Status, number>,
        jobs: jobs.filter(Boolean).map((job) => formatJob(job, queue)),
        pagination,
        readOnlyMode: queue.readOnlyMode,
        allowRetries: queue.allowRetries,
        isPaused,
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
  const stats = pairs.length > 0 ? await getStats(pairs[0][1]) : {};

  return {
    body: {
      stats,
      queues,
    },
  };
}
