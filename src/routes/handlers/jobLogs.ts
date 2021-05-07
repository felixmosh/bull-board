import { Request, RequestHandler, Response } from 'express-serve-static-core'

export const jobLogs: RequestHandler = async (req: Request, res: Response) => {
  const { jobId } = req.params
  const { queue } = res.locals

  const logs = await queue.getJobLogs(jobId)

  return res.json(logs)
}
