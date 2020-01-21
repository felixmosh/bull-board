import express, { RequestHandler } from 'express'
import path from 'path'
import {} from 'bull'

import { queues as queuesRoute } from './routes/queues'
import { retryAll } from './routes/retryAll'
import { retryJob } from './routes/retryJob'
import { cleanAll } from './routes/cleanAll'
import { entryPoint } from './routes/index'

const app = express()
const queues = {}

const wrapAsync = (fn: RequestHandler): RequestHandler => async (
  req,
  res,
  next,
) => Promise.resolve(fn(req, res, next)).catch(next)

const UI = () => {
  app.locals.queues = queues

  app.set('view engine', 'ejs')
  app.set('views', `${__dirname}/ui`)

  app.use('/static', express.static(path.join(__dirname, './static')))

  app.get('/', entryPoint)
  app.get('/queues', wrapAsync(queuesRoute))
  app.put('/queues/:queueName/retry', wrapAsync(retryAll))
  app.put('/queues/:queueName/:id/retry', wrapAsync(retryJob))
  app.put('/queues/:queueName/clean/:queueStatus', wrapAsync(cleanAll))

  return app
}

const getQueueVersion = queue => {
  if (typeof queue.drain === 'function') {
    return 4
  }

  if (typeof queue.pauseWorker === 'function') {
    return 4
  }

  return 3
}

export default {
  UI: UI(),
  setQueues(bullQueues) {
    bullQueues.forEach(item => {
      queues[item.name] = { ...item, version: getQueueVersion(item) }
    })
  },
}
