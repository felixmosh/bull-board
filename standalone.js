const { setQueues, router } = require('./dist/index')
const Queue = require('bull')
const redis = require('redis')
const app = require('express')()

const redisOptions = {
  redis: {
    port: process.env.REDIS_PORT || 6379,
    host: process.env.REDIS_HOST || 'localhost',
    password: process.env.REDIS_PASSWORD || '',
    tls: process.env.REDIS_USE_TLS || false,
  },
}

const client = redis.createClient(redisOptions.redis)

let queue_names = []

const prefix = process.env.BULL_PREFIX || 'bull'

function refreshQueues() {
  console.log('Refreshing Queues')
  client.KEYS(`${prefix}:*`, (_err, keys) => {
    keys.map(key => {
      const queue_name = key.replace(/^.+?:(.+?):.+?$/, '$1')
      if (!queue_names.includes(queue_name)) {
        setQueues([new Queue(queue_name, redisOptions)])
        queue_names.push(queue_name)
      }
    })
  })
}

const run = () => {
  setInterval(refreshQueues, process.env.REFRESH_INTERVAL || 10000)

  refreshQueues()

  app.use('/ui', router)
  app.listen(3000, () => {
    console.log('Running on 3000...')
    console.log('For the UI, open http://localhost:3000/ui')
    console.log('Make sure Redis is running on port 6379 by default')
  })
}

run()
