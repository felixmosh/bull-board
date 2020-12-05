import { Request, RequestHandler, Response } from 'express-serve-static-core'
import { BullBoardQueues, JobCleanStatus } from '../@types/app'

type RequestParams = {
  queueName: string
  queueStatus: JobCleanStatus
}

export const cleanAll: RequestHandler<RequestParams> = async (
  req: Request,
  res: Response,
) => {
  try {
    const { queueName, queueStatus } = req.params
    const { bullBoardQueues } = req.app.locals as {
      bullBoardQueues: BullBoardQueues
    }

    const GRACE_TIME_MS = 5000

    const { queue } = bullBoardQueues[queueName]
    if (!queue) {
      return res.status(404).send({
        error: 'Queue not found',
      })
    }

    await queue.clean(queueStatus as any, GRACE_TIME_MS)

    return res.sendStatus(200)
  } catch (e) {
    const body = {
      error: 'queue error',
      details: e.stack,
    }
    return res.status(500).send(body)
  }
}
