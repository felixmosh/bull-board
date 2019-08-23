module.exports = async function handler(req, res) {
  try {
    const { queueName } = req.params
    const { queues } = req.app.locals

    const queue = queues[queueName]
    if (!queue) {
      return res.status(404).send({ error: 'queue not found' })
    }

    const jobs = await queue.getJobs('failed')
    await Promise.all(jobs.map(job => job.retry()))

    return res.sendStatus(200)
  } catch (e) {
    const body = {
      error: 'queue error',
      details: e.stack,
    }
    return res.status(500).send(body)
  }
}
