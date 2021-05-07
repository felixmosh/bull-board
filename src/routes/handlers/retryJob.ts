import { Request, RequestHandler, Response } from 'express-serve-static-core'
import { QueueJob } from '../../@types/app'

export const retryJob: RequestHandler = async (
  _req: Request,
  res: Response,
) => {
  const { job } = res.locals as { job: QueueJob }

  await job.retry()

  return res.sendStatus(204)
}
