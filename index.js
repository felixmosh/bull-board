const Queue = require('bull')
const express = require('express')
const bodyParser = require('body-parser')
const router = require('express-async-router').AsyncRouter()
const path = require('path')

const queues = {}

function UI() {
  const app = express()

  app.locals.queues = queues

  app.set('view engine', 'ejs')
  app.set('views', `${__dirname}/ui`)

  router.use('/static', express.static(path.join(__dirname, './static')))
  router.get('/queues', require('./routes/queues'))
  router.put('/queues/:queueName/retry', require('./routes/retryAll'))
  router.put('/queues/:queueName/:id/retry', require('./routes/retryJob'))
  router.put('/queues/:queueName/clean/:queueStatus', require('./routes/cleanAll'))
  router.get('/', require('./routes/index'))

  app.use(bodyParser.json())
  app.use(router)

  return app
}

module.exports = {
  UI: UI(),
  setQueues: (bullQueues) => {
    if (!Array.isArray(bullQueues)) {
      bullQueues = [bullQueues];
    }

    bullQueues.forEach((item) => {
      queues[item.name] = item;
    })

    return queues
  },
  createQueues: redis => {
    return {
      add: (name, opts) => {
        const queue = new Queue(name, redis, opts)
        queues[name] = queue

        return queue
      },
    }
  },
}
