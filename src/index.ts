import express, { RequestHandler } from 'express'
import path from 'path'
import { Queue } from 'bull'
import { Queue as QueueMq } from 'bullmq'

import { queuesHandler } from './routes/queues'
import { retryAll } from './routes/retryAll'
import { retryJob } from './routes/retryJob'
import { cleanAll } from './routes/cleanAll'
import { entryPoint } from './routes/index'
import { BullBoardQueues } from './@types'

const bullBoardQueues: BullBoardQueues = {}

const wrapAsync = (fn: RequestHandler): RequestHandler => async (
  req,
  res,
  next,
) => Promise.resolve(fn(req, res, next)).catch(next)

const router = express()
router.locals.bullBoardQueues = bullBoardQueues

router.set('view engine', 'ejs')
router.set('views', `${__dirname}/../src/ui`)

router.use('/static', express.static(path.join(__dirname, '../static')))

router.get('/', entryPoint)
router.get('/queues', wrapAsync(queuesHandler))
router.put('/queues/:queueName/retry', wrapAsync(retryAll))
router.put('/queues/:queueName/:id/retry', wrapAsync(retryJob))
router.put('/queues/:queueName/clean/:queueStatus', wrapAsync(cleanAll))

export const setQueues = (bullQueues: Queue[] | QueueMq[]) => {
  bullQueues.forEach((queue: Queue | QueueMq) => {
    const name = queue instanceof QueueMq ? queue.toKey('~') : queue.name // TODO: Figure out what 'type' to give `toKey`

    bullBoardQueues[name] = {
      queue,
    }
  })
}

export { router }
