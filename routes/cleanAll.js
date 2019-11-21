module.exports = async function handler(req, res) {
  try {
    const { queueName, queueStatus } = req.params
    const { queues } = req.app.locals

    const GRACE_TIME_MS = 5000

    const queue = queues[queueName]
    if (!queue) {
      return res.status(404).send({ error: 'queue not found' })
    }

    await queue.clean(GRACE_TIME_MS, queueStatus)

    return res.sendStatus(200)
  } catch (e) {
    const body = {
      error: 'queue error',
      details: e.stack,
    }
    return res.status(500).send(body)
  }
}
