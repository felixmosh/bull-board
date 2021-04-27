import { Router } from 'express'
import { ParamsDictionary, RequestHandler } from 'express-serve-static-core'
import { cleanAll } from './handlers/cleanAll'
import { cleanJob } from './handlers/cleanJob'
import { errorHandler } from './handlers/errorHandler'
import { jobLogs } from './handlers/jobLogs'
import { promoteJob } from './handlers/promoteJob'
import { queuesHandler } from './handlers/queues'
import { retryAll } from './handlers/retryAll'
import { retryJob } from './handlers/retryJob'

const wrapAsync = <Params extends ParamsDictionary>(
  fn: RequestHandler<Params>,
): RequestHandler<Params> => async (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next)

export const apiRouter = Router()
  .get('/queues', wrapAsync(queuesHandler))
  .put('/queues/:queueName/retry', wrapAsync(retryAll))
  .put('/queues/:queueName/:id/retry', wrapAsync(retryJob))
  .put('/queues/:queueName/:id/clean', wrapAsync(cleanJob))
  .put('/queues/:queueName/:id/promote', wrapAsync(promoteJob))
  .get('/queues/:queueName/:id/logs', wrapAsync(jobLogs))
  .put('/queues/:queueName/clean/:queueStatus', wrapAsync(cleanAll))
  .use(errorHandler)
