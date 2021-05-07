import { NextFunction, Request, Response } from 'express-serve-static-core'
import { BaseAdapter } from '../../queueAdapters/base'

export function jobProvider() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const { jobId } = req.params
    const { queue } = res.locals as { queue: BaseAdapter }

    if (!jobId || !queue) {
      return next(new Error('Invalid data'))
    }

    const job = await queue.getJob(jobId)

    if (!job) {
      return res.status(404).send({
        error: 'Job not found',
      })
    }

    res.locals.job = job

    next()
  }
}
