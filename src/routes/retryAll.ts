import { Request, RequestHandler, Response } from 'express-serve-static-core'

import { BullBoardQueues } from '../@types/app'

export const retryAll: RequestHandler = async (req: Request, res: Response) => {
  try {
    const { queueName } = req.params
    const { bullBoardQueues } = req.app.locals as {
      bullBoardQueues: BullBoardQueues
    }

    const { queue } = bullBoardQueues[queueName]
    if (!queue) {
      return res.status(404).send({ error: 'queue not found' })
    } else if (queue.readOnlyMode) {
      return res.status(405).send({
        error: 'Method not allowed on read only queue',
      })
    }

    const jobs = await queue.getJobs(['failed'])
    await Promise.all(jobs.map((job) => job.retry()))

    return res.sendStatus(200)
  } catch (e) {
    const body = {
      error: 'queue error',
      details: e.stack,
    }

    return res.status(500).send(body)
  }
}
