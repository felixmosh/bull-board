const express = require('express')
const bodyParser = require('body-parser')
const router = require('express-async-router').AsyncRouter()
const path = require('path')

const queues = {}
const queuesVersions = {}

function UI() {
  const app = express()

  app.locals.queues = queues
  app.locals.queuesVersions = queuesVersions

  app.set('view engine', 'ejs')
  app.set('views', `${__dirname}/ui`)

  router.use('/static', express.static(path.join(__dirname, './static')))
  router.get('/queues', require('./routes/queues'))
  router.put('/queues/:queueName/retry', require('./routes/retryAll'))
  router.put('/queues/:queueName/:id/retry', require('./routes/retryJob'))
  router.put(
    '/queues/:queueName/clean/:queueStatus',
    require('./routes/cleanAll'),
  )
  router.get('/', require('./routes/index'))

  app.use(bodyParser.json())
  app.use(router)

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
