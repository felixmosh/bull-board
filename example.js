const { setQueues, router } = require('./dist/index')
const { Queue3: QueueMQ } = require('bullmq/dist/classes/compat')
const Queue3 = require('bull')
const app = require('express')()

const sleep = t => new Promise(resolve => setTimeout(resolve, t * 1000))

const redisOptions = {
  port: 6379,
  host: 'localhost',
  password: '',
  tls: false,
}

const createQueue3 = name => new Queue3(name, { redis: redisOptions })
const createQueueMQ = name => new QueueMQ(name, { connection: redisOptions })

const run = () => {
  const example3 = createQueue3('ExampleBull')
  const exampleMQ = createQueueMQ('ExampleBullMQ')

  setQueues([example3, exampleMQ])

  example3.process(async job => {
    for (let i = 0; i <= 100; i++) {
      await sleep(Math.random())
      job.progress(i)
      if (Math.random() * 200 < 1) throw new Error(`Random error ${i}`)
    }
  })

  exampleMQ.process(async job => {
    for (let i = 0; i <= 100; i++) {
      await sleep(Math.random())
      await job.updateProgress(i)
      if (Math.random() * 200 < 1) throw new Error(`Random error ${i}`)
    }
  })

  app.use('/add', (req, res) => {
    example3.add({ title: req.query.title })
    exampleMQ.add('Add', { title: req.query.title })
    res.json({ ok: true })
  })

  app.use('/ui', router)
  app.listen(3000, () => {
    console.log('Running on 3000...')
    console.log('For the UI, open http://localhost:3000/ui')
    console.log('Make sure Redis is running on port 6379 by default')
    console.log('To populate the queue, run:')
    console.log('  curl http://localhost:3000/add?title=Example')
  })
}

run()
