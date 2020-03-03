import express, { RequestHandler } from 'express'
import { ParamsDictionary } from 'express-serve-static-core'
import path from 'path'
import { Queue } from 'bull'
import { Queue as QueueMq } from 'bullmq'

import { queuesHandler } from './routes/queues'
import { retryAll } from './routes/retryAll'
import { retryJob } from './routes/retryJob'
import { promoteJob } from './routes/promoteJob'
import { cleanAll } from './routes/cleanAll'
import { entryPoint } from './routes/index'
import { BullBoardQueues } from './@types/app'

const bullBoardQueues: BullBoardQueues = {}

const wrapAsync = <Params extends ParamsDictionary>(
  fn: RequestHandler<Params>,
): RequestHandler<Params> => async (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next)

const router = express()
router.locals.bullBoardQueues = bullBoardQueues

router.set('view engine', 'ejs')
router.set('views', `${__dirname}/dist/ui`)

router.use('/static', express.static(path.join(__dirname, './static')))

router.get('/', entryPoint)
router.get('/queues', wrapAsync(queuesHandler))
router.put('/queues/:queueName/retry', wrapAsync(retryAll))
router.put('/queues/:queueName/:id/retry', wrapAsync(retryJob))
router.put('/queues/:queueName/:id/promote', wrapAsync(promoteJob))
router.put('/queues/:queueName/clean/:queueStatus', wrapAsync(cleanAll))

export const setQueues = (bullQueues: Queue[] | QueueMq[]) => {
  bullQueues.forEach((queue: Queue | QueueMq) => {
    const name = queue instanceof QueueMq ? queue.toKey('~') : queue.name

    bullBoardQueues[name] = {
      queue,
    }
  })
}

export { router }
