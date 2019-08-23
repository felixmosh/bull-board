module.exports = async function retryJob(req, res) {
  try {
    const { queues } = req.app.locals
    const { queueName, id } = req.params

    const queue = queues[queueName]

    if (!queue) {
      return res.status(404).send({ error: 'queue not found' })
    }

    const job = await queue.getJob(id)

    if (!job) {
      return res.status(404).send({ error: 'job not found' })
    }

    await job.retry()
    return res.sendStatus(204)
  } catch (e) {
    const body = {
      error: 'queue error',
      details: e.stack,
    }
    return res.status(500).send(body)
  }
}
