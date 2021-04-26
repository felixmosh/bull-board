import { Request, RequestHandler, Response } from 'express-serve-static-core'
import { BullBoardQueues } from '../@types/app'

export const jobLogs: RequestHandler = async (req: Request, res: Response) => {
  const { bullBoardQueues } = req.app.locals as {
    bullBoardQueues: BullBoardQueues
  }
  const { queueName, id } = req.params
  const queue = bullBoardQueues.get(queueName)

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

  const logs = await queue.getJobLogs(id)

  return res.json(logs)
}
