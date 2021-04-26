import express from 'express'
import {
  Express,
  ParamsDictionary,
  RequestHandler,
} from 'express-serve-static-core'
import path from 'path'
import { BullBoardQueues, QueueAdapter } from './@types/app'
import { cleanAll } from './routes/cleanAll'
import { cleanJob } from './routes/cleanJob'
import { errorHandler } from './routes/errorHandler'
import { entryPoint } from './routes/index'
import { jobLogs } from './routes/jobLogs'
import { promoteJob } from './routes/promoteJob'

import { queuesHandler } from './routes/queues'
import { retryAll } from './routes/retryAll'
import { retryJob } from './routes/retryJob'

export { BullMQAdapter } from './queueAdapters/bullMQ'
export { BullAdapter } from './queueAdapters/bull'

const bullBoardQueues: BullBoardQueues = new Map<string, QueueAdapter>()

const wrapAsync = <Params extends ParamsDictionary>(
  fn: RequestHandler<Params>,
): RequestHandler<Params> => async (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next)

const router: Express = express()
router.locals.bullBoardQueues = bullBoardQueues

router.set('view engine', 'ejs')
router.set('views', path.resolve(__dirname, '../dist/ui'))

router.use('/static', express.static(path.resolve(__dirname, '../static')))

router.get(['/', '/queue/:queueName'], entryPoint)
router.get('/api/queues', wrapAsync(queuesHandler))
router.put('/api/queues/:queueName/retry', wrapAsync(retryAll))
router.put('/api/queues/:queueName/:id/retry', wrapAsync(retryJob))
router.put('/api/queues/:queueName/:id/clean', wrapAsync(cleanJob))
router.put('/api/queues/:queueName/:id/promote', wrapAsync(promoteJob))
router.get('/api/queues/:queueName/:id/logs', wrapAsync(jobLogs))
router.put('/api/queues/:queueName/clean/:queueStatus', wrapAsync(cleanAll))
router.use(errorHandler)

export const setQueues = (bullQueues: ReadonlyArray<QueueAdapter>): void => {
  bullQueues.forEach((queue) => {
    const name = queue.getName()

    bullBoardQueues.set(name, queue)
  })
}

export const replaceQueues = (
  bullQueues: ReadonlyArray<QueueAdapter>,
): void => {
  const queuesToPersist: string[] = bullQueues.map((queue) => queue.getName())

  bullBoardQueues.forEach((_queue, name) => {
    if (queuesToPersist.indexOf(name) === -1) {
      bullBoardQueues.delete(name)
    }
  })

  return setQueues(bullQueues)
}

export { router }
