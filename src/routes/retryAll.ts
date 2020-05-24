import { RequestHandler } from 'express'
import { Job } from 'bull'
import { Job as JobMq } from 'bullmq'

import { BullBoardQueues } from '../@types/app'

export const retryAll: RequestHandler = async (req, res) => {
  try {
    const { queueName } = req.params
    const {
      bullBoardQueues,
    }: { bullBoardQueues: BullBoardQueues } = req.app.locals

    const { queue } = bullBoardQueues[queueName]
    if (!queue) {
      return res.status(404).send({ error: 'queue not found' })
    }

    const jobs: (Job | JobMq)[] = await queue.getJobs(['failed'])
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
