const { pick, isEmpty } = require('ramda')

const metrics = [
  'redis_version',
  'used_memory',
  'mem_fragmentation_ratio',
  'connected_clients',
  'blocked_clients',
]

async function getStats(queue) {
  const client = await queue.client
  await client.info()

  const validMetrics = pick(metrics, client.serverInfo)
  validMetrics.total_system_memory =
    client.serverInfo.total_system_memory || client.serverInfo.maxmemory

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

const formatJobMQ = job => {
  return {
    ...formatJob(job),
    progress: job.progress,
    name: job.name,
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

module.exports = async function getDataForQeues({
  queues,
  queuesVersions,
  query = {},
}) {
  if (isEmpty(queues)) {
    return { stats: {}, queues: [] }
  }

  const pairs = Object.entries(queues)

  const counts = await Promise.all(
    pairs.map(async ([name, queue]) => {
      const counts = await queue.getJobCounts(...statuses)

      let jobs = []
      if (name) {
        const status = query[name] === 'latest' ? statuses : query[name]
        jobs = await queue.getJobs(status, 0, 10)
      }

      return {
        name,
        counts,
        jobs: jobs.map(queuesVersions[name] === 4 ? formatJobMQ : formatJob),
        version: queuesVersions[name],
      }
    }),
  )
  const stats = await getStats(pairs[0][1])

  return { stats, queues: counts }
}
