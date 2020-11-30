import { RequestHandler } from 'express'

import { BullBoardQueues, JobCleanStatus } from '../@types/app'

type RequestParams = {
  queueName: string
  queueStatus: JobCleanStatus
}

export const cleanAll: RequestHandler<RequestParams> = async (req, res) => {
  try {
    const { queueName, queueStatus } = req.params
    const {
      bullBoardQueues,
    }: { bullBoardQueues: BullBoardQueues } = req.app.locals

    const GRACE_TIME_MS = 5000

    const { queue } = bullBoardQueues[queueName]
    if (!queue) {
      return res.status(404).send({
        error: 'Queue not found',
      })
    }

    await queue.clean(queueStatus, GRACE_TIME_MS)

    return res.sendStatus(200)
  } catch (e) {
    const body = {
      error: 'queue error',
      details: e.stack,
    }
    return res.status(500).send(body)
  }
}
