const { pick, isEmpty } = require('ramda')
const { parse: parseRedisInfo } = require('redis-info')

const getPaginationParameters = require('./pagination')

const metrics = [
  'redis_version',
  'used_memory',
  'mem_fragmentation_ratio',
  'connected_clients',
  'blocked_clients',
]

async function getStats(queue) {
  const rawRedisInfo = await queue.client.info()
  const redisInfo = parseRedisInfo(rawRedisInfo)

  const validMetrics = pick(metrics, redisInfo)
  validMetrics.total_system_memory =
    redisInfo.total_system_memory || redisInfo.maxmemory

  return validMetrics
}

const formatJob = job => {
  return {
    id: job.id,
    timestamp: job.timestamp,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
    progress: job._progress,
    attempts: job.attemptsMade,
    delay: job.delay,
    failedReason: job.failedReason,
    stacktrace: job.stacktrace,
    opts: job.opts,
    data: job.data,
  }
}

const statuses = [
  'active',
  'waiting',
  'completed',
  'failed',
  'delayed',
  'paused',
]

module.exports = async function getDataForQeues({ queues, query = {} }) {
  if (isEmpty(queues)) {
    return { stats: {}, queues: [] }
  }

  const pairs = Object.entries(queues)

  const counts = await Promise.all(
    pairs.map(async ([name, queue]) => {
      const counts = await queue.getJobCounts()

      let jobs = []
      if (name) {
        const status = query[name] === 'latest' ? statuses : query[name]
        
        const [paginationStartIndex, paginationEndIndex] = getPaginationParameters(query)

        jobs = await queue.getJobs(status, paginationStartIndex, paginationEndIndex)
      }

      return {
        name,
        counts,
        jobs: jobs.map(formatJob),
      }
    }),
  )
  const stats = await getStats(pairs[0][1])

  return { stats, queues: counts }
}

