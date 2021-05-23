import { parse as parseRedisInfo } from 'redis-info';
import { BaseAdapter } from '../queueAdapters/base';
import {
  AppJob,
  AppQueue,
  BullBoardRequest,
  ControllerHandlerReturnType,
  JobStatus,
  QueueJob,
  Status,
  ValidMetrics,
} from '../../typings/app';

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

  validMetrics.total_system_memory =
    redisInfo.total_system_memory || redisInfo.maxmemory;

  return validMetrics;
};

const formatJob = (job: QueueJob, queue: BaseAdapter): AppJob => {
  const jobProps = job.toJSON();

  return {
    id: jobProps.id,
    timestamp: jobProps.timestamp,
    processedOn: jobProps.processedOn,
    finishedOn: jobProps.finishedOn,
    progress: jobProps.progress,
    attempts: jobProps.attemptsMade,
    delay: job.opts.delay,
    failedReason: jobProps.failedReason,
    stacktrace: jobProps.stacktrace ? jobProps.stacktrace.filter(Boolean) : [],
    opts: jobProps.opts,
    data: queue.format('data', jobProps.data),
    name: jobProps.name,
    returnValue: queue.format('returnValue', jobProps.returnvalue),
  };
};

const statuses: JobStatus[] = [
  'active',
  'completed',
  'delayed',
  'failed',
  'paused',
  'waiting',
];

async function getAppQueues(
  pairs: [string, BaseAdapter][],
  query: Record<string, any>
): Promise<AppQueue[]> {
  return await Promise.all(
    pairs.map(async ([name, queue]) => {
      const counts = await queue.getJobCounts(...statuses);
      const status =
        query[name] === 'latest' ? statuses : (query[name] as JobStatus[]);
      const jobs = await queue.getJobs(status, 0, 10);

      return {
        name,
        counts: counts as Record<Status, number>,
        jobs: jobs.filter(Boolean).map((job) => formatJob(job, queue)),
        readOnlyMode: queue.readOnlyMode,
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
