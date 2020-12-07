import { Request, RequestHandler, Response } from 'express-serve-static-core'
import { BullBoardQueues } from '../@types/app'

export const retryJob: RequestHandler = async (req: Request, res: Response) => {
  try {
    const { bullBoardQueues } = req.app.locals as {
      bullBoardQueues: BullBoardQueues
    }
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

    await job.retry()

    return res.sendStatus(204)
  } catch (e) {
    return res.status(500).send({
      error: 'queue error',
      details: e.stack,
    })
  }
}
