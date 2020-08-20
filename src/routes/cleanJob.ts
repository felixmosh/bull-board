import { RequestHandler } from 'express'
import { BullBoardQueues } from '../@types/app'

export const cleanJob: RequestHandler = async (req, res) => {
  try {
    const {
      bullBoardQueues,
    }: { bullBoardQueues: BullBoardQueues } = req.app.locals
    const { queueName, id } = req.params
    const { queue } = bullBoardQueues[queueName]

    if (!queue) {
      return res.status(404).send({
        error: 'Queue not found',
      })
    }

    const job = await queue.getJob(id)

    if (!job) {
      return res.status(404).send({
        error: 'Job not found',
      })
    }

    await job.remove()

    return res.sendStatus(204)
  } catch (error) {
    const body = {
      error: 'queue error',
      details: error.stack,
    }
    return res.status(500).send(body)
  }
}
