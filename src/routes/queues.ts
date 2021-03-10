import { Job } from 'bull'
import { Job as JobMq } from 'bullmq'
import { Request, RequestHandler, Response } from 'express-serve-static-core'
import { parse as parseRedisInfo } from 'redis-info'

import * as api from '../@types/api'
import * as app from '../@types/app'
import { JobStatus, QueueAdapter } from '../@types/app'
import { Status } from '../ui/components/constants'

type MetricName = keyof app.ValidMetrics

const metrics: MetricName[] = [
  'redis_version',
  'used_memory',
  'mem_fragmentation_ratio',
  'connected_clients',
  'blocked_clients',
]

const getStats = async ({
  queue,
}: app.BullBoardQueue): Promise<app.ValidMetrics> => {
  const redisClient = await queue.getClient()
  const redisInfoRaw = await redisClient.info()
  const redisInfo = parseRedisInfo(redisInfoRaw)

  const validMetrics = metrics.reduce((acc, metric) => {
    if (redisInfo[metric]) {
      acc[metric] = redisInfo[metric]
    }

    return acc
  }, {} as Record<MetricName, string>)

  validMetrics.total_system_memory =
    redisInfo.total_system_memory || redisInfo.maxmemory

  return validMetrics
}

const formatJob = (job: Job | JobMq, queue: QueueAdapter): app.AppJob => {
  const jobProps = job.toJSON()

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
  }
}

const statuses: JobStatus[] = [
  'active',
  'completed',
  'delayed',
  'failed',
  'paused',
  'waiting',
]

const getDataForQueues = async (
  bullBoardQueues: app.BullBoardQueues,
  req: Request,
): Promise<api.GetQueues> => {
  const query = req.query || {}
  const pairs = Object.entries(bullBoardQueues)

  if (pairs.length == 0) {
    return {
      stats: {},
      queues: [],
    }
  }

  const queues: app.AppQueue[] = await Promise.all(
    pairs.map(async ([name, { queue }]) => {
      const counts = await queue.getJobCounts(...statuses)
      const status =
        query[name] === 'latest' ? statuses : (query[name] as JobStatus[])
      const jobs = await queue.getJobs(status, 0, 10)

      return {
        name,
        counts: counts as Record<Status, number>,
        jobs: jobs.filter(Boolean).map((job) => formatJob(job, queue)),
        readOnlyMode: queue.readOnlyMode,
      }
    }),
  )

  const stats = await getStats(pairs[0][1])

  return {
    stats,
    queues,
  }
}

export const queuesHandler: RequestHandler = async (
  req: Request,
  res: Response,
) => {
  const { bullBoardQueues } = req.app.locals

  res.json(await getDataForQueues(bullBoardQueues, req))
}
