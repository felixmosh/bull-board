import { Request, RequestHandler, Response } from 'express-serve-static-core'

import { BullBoardQueues } from '../@types/app'

export const getLogs: RequestHandler = async (req: Request, res: Response) => {
  try {
    const { queueName, id } = req.params
    const { bullBoardQueues } = req.app.locals as {
      bullBoardQueues: BullBoardQueues
    }
    const { queue } = bullBoardQueues[queueName]
    if (!queue) {
      return res.status(404).send({ error: 'queue not found' })
    }

    const logs = await queue.getLogs(id)

    return res.send(logs)
  } catch (e) {
    const body = {
      error: 'queue error',
      details: e.stack,
    }

    return res.status(500).send(body)
  }
}
