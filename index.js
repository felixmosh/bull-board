const express = require('express')
const path = require('path')

const queues = {}
const queuesVersions = {}

function wrapAsync(fn) {
  return (req, res, next) => {
    const fnReturn = fn(req, res, next)

    return Promise.resolve(fnReturn).catch(next)
  }
}

function UI() {
  const app = express()

  app.locals.queues = queues
  app.locals.queuesVersions = queuesVersions

  app.set('view engine', 'ejs')
  app.set('views', `${__dirname}/ui`)

  app.use('/static', express.static(path.join(__dirname, './static')))

  app.get('/queues', wrapAsync(require('./routes/queues')))
  app.put('/queues/:queueName/retry', wrapAsync(require('./routes/retryAll')))
  app.put(
    '/queues/:queueName/:id/retry',
    wrapAsync(require('./routes/retryJob')),
  )
  app.put(
    '/queues/:queueName/clean/:queueStatus',
    wrapAsync(require('./routes/cleanAll')),
  )
  app.get('/', require('./routes/index'))

  return app
}

/**
 * Return the version of the queue.
 * Can be 3 (Bull3) or 4 (BullMQ).
 * @param queue
 */
function getQueueVersion(queue) {
  // Check for BullMQ Queue class
  if (typeof queue.drain === 'function') {
    return 4
  }
  // Check for BullMQ compat class
  if (typeof queue.pauseWorker === 'function') {
    return 4
  }
  return 3
}

module.exports = {
  UI: UI(),
  setQueues: bullQueues => {
    if (!Array.isArray(bullQueues)) {
      bullQueues = [bullQueues]
    }

    bullQueues.forEach(item => {
      queues[item.name] = item
      queuesVersions[item.name] = getQueueVersion(item)
    })

    return queues
  },
}
