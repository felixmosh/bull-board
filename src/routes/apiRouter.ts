import { Router } from 'express'
import { cleanAll } from './handlers/cleanAll'
import { cleanJob } from './handlers/cleanJob'
import { errorHandler } from './handlers/errorHandler'
import { jobLogs } from './handlers/jobLogs'
import { promoteJob } from './handlers/promoteJob'
import { queuesHandler } from './handlers/queues'
import { retryAll } from './handlers/retryAll'
import { retryJob } from './handlers/retryJob'
import { jobProvider } from './middlewares/jobProvider'
import { queueProvider } from './middlewares/queueProvider'
import { wrapAsync } from './middlewares/wrapAsync'

export const apiRouter = Router()
  .get('/queues', wrapAsync(queuesHandler))
  .put('/queues/:queueName/retry', queueProvider(), wrapAsync(retryAll))
  .put(
    '/queues/:queueName/:jobId/retry',
    [queueProvider(), jobProvider()],
    wrapAsync(retryJob),
  )
  .put(
    '/queues/:queueName/:jobId/clean',
    [queueProvider(), jobProvider()],
    wrapAsync(cleanJob),
  )
  .put(
    '/queues/:queueName/:jobId/promote',
    [queueProvider(), jobProvider()],
    wrapAsync(promoteJob),
  )
  .put(
    '/queues/:queueName/clean/:queueStatus',
    queueProvider(),
    wrapAsync(cleanAll),
  )
  .get(
    '/queues/:queueName/:jobId/logs',
    [queueProvider({ skipReadOnlyModeCheck: true }), jobProvider()],
    wrapAsync(jobLogs),
  )
  .use(errorHandler)
