const express = require('express')
const path = require('path')

const queues = {}

function wrapAsync(fn) {
  return (req, res, next) => {
    const fnReturn = fn(req, res, next)

    return Promise.resolve(fnReturn).catch(next)
  }
}

function UI() {
  const app = express()

  app.locals.queues = queues

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

function getQueueVersion(queue) {
  if (typeof queue.drain === 'function') {
    return 4
  }

  if (typeof queue.pauseWorker === 'function') {
    return 4
  }

  return 3
}

module.exports = {
  UI: UI(),
  setQueues(bullQueues) {
    bullQueues.forEach(item => {
      queues[item.name] = { ...item, version: getQueueVersion(item) }
    })
  },
}
