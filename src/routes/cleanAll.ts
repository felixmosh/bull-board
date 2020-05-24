import { RequestHandler } from 'express'
import { Queue as QueueMq } from 'bullmq'

import { BullBoardQueues } from '../@types/app'

type RequestParams = {
  queueName: string
  queueStatus: 'completed' | 'wait' | 'active' | 'delayed' | 'failed'
}

export const cleanAll: RequestHandler<RequestParams> = async (req, res) => {
  try {
    const { queueName, queueStatus } = req.params
    const {
      bullBoardQueues,
    }: { bullBoardQueues: BullBoardQueues } = req.app.locals

    const GRACE_TIME_MS = 5000
    const LIMIT = 1000

    const { queue } = bullBoardQueues[queueName]
    if (!queue) {
      return res.status(404).send({
        error: 'Queue not found',
      })
    }

    if (queue instanceof QueueMq) {
      await queue.clean(GRACE_TIME_MS, LIMIT, queueStatus)
    } else {
      await queue.clean(GRACE_TIME_MS, queueStatus)
    }

    return res.sendStatus(200)
  } catch (e) {
    const body = {
      error: 'queue error',
      details: e.stack,
    }
    return res.status(500).send(body)
  }
}
