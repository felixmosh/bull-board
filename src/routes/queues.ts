import { RequestHandler, Request } from 'express'
import { Job } from 'bull'
import { Job as JobMq } from 'bullmq'

import { BullBoardQueues, BullBoardQueue } from '../@types'

interface ValidMetrics {
  total_system_memory?: string
  redis_version?: string
  used_memory?: string
  mem_fragmentation_ratio?: string
  connected_clients?: string
  blocked_clients?: string
}

const metrics = [
  'redis_version',
  'used_memory',
  'mem_fragmentation_ratio',
  'connected_clients',
  'blocked_clients',
]

const getStats = async ({ queue }: BullBoardQueue) => {
  const redisClient = await queue.client
  await redisClient.info()

  // TODO:
  // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
  // @ts-ignore
  const { serverInfo } = redisClient

  const validMetrics: ValidMetrics = metrics.reduce((accumulator, value) => {
    if (value in serverInfo) {
      // TODO:
      // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
      // @ts-ignore
      accumulator[value] = serverInfo[value]
    }

    return accumulator
  }, {})

  // eslint-disable-next-line @typescript-eslint/camelcase
  validMetrics.total_system_memory =
    serverInfo.total_system_memory || serverInfo.maxmemory

  return validMetrics
}

const formatJob = (job: Job | JobMq) => ({
  id: job.id,
  timestamp: job.timestamp,
  processedOn: job.processedOn,
  finishedOn: job.finishedOn,
  progress: job.progress,
  attempts: job.attemptsMade,
  delay: job.isDelayed, // TODO: This is a promise
  // failedReason: job.failedReason,
  stacktrace: job.stacktrace,
  opts: job.opts,
  data: job.data,
  name: job.name,
})

const statuses = [
  'active',
  'completed',
  'delayed',
  'failed',
  'paused',
  'waiting',
]

const getDataForQueues = async (
  bullBoardQueues: BullBoardQueues,
  req: Request,
) => {
  const query = req.query || {}
  const pairs = Object.entries(bullBoardQueues)

  if (pairs.length == 0) {
    return {
      stats: {},
      queues: [],
    }
  }

  const counts = await Promise.all(
    pairs.map(async ([name, { queue, version }]) => {
      const counts = await queue.getJobCounts(...statuses)

      let jobs: (Job | JobMq)[] = [] // eslint-disable-line prettier/prettier
      if (name) {
        const status = query[name] === 'latest' ? statuses : query[name]
        jobs = await queue.getJobs(status, 0, 10)
      }

      return {
        name,
        counts,
        jobs: jobs.map(formatJob),
        version,
      }
    }),
  )

  const stats = getStats(pairs[0][1])

  return {
    stats,
    queues: counts,
  }
}

export const queuesHandler: RequestHandler = async (req, res) => {
  const { bullBoardQueues } = req.app.locals

  res.json(await getDataForQueues(bullBoardQueues, req))
}
