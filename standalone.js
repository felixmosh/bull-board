const { createQueues, setQueues, UI } = require('./index')
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

const prefix = process.env.BULL_PREFIX || 'bull'

function refreshQueues() {
  console.log('Refreshing Queues')
  client.KEYS(`${prefix}:*`, (err, keys) => {
    keys = [
      ...new Set(keys.map(key => key.replace(/^.+?:(.+?):.+?$/, '$1'))),
    ].map(name => new Queue(name, redisOptions))
    setQueues(keys)
  })
}

setInterval(refreshQueues, process.env.REFRESH_INTERVAL || 10000)

refreshQueues()

app.use('/ui', UI)

app.listen(process.env.PORT || 3000, () => {
  console.log('Running on 3000...')
  console.log('For the UI, open http://localhost:3000/ui')
  console.log('Make sure Redis is running on port 6379 by default')
})
