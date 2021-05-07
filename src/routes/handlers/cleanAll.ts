import { Request, RequestHandler, Response } from 'express-serve-static-core'
import { JobCleanStatus } from '../../@types/app'

type RequestParams = {
  queueName: string
  queueStatus: JobCleanStatus
}

export const cleanAll: RequestHandler<RequestParams> = async (
  req: Request,
  res: Response,
) => {
  const { queueStatus } = req.params
  const { queue } = res.locals

  const GRACE_TIME_MS = 5000

  await queue.clean(queueStatus as any, GRACE_TIME_MS)

  return res.sendStatus(200)
}
