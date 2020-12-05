const { setQueues, router, BullMQAdapter } = require('./dist/index')
const { Queue: QueueMQ, Worker, QueueScheduler } = require('bullmq')
const Queue3 = require('bull')
const app = require('express')()

const sleep = (t) => new Promise((resolve) => setTimeout(resolve, t * 1000))

const redisOptions = {
  port: 6379,
  host: 'localhost',
  password: '',
  tls: false,
}

const createQueue3 = (name) => new Queue3(name, { redis: redisOptions })
const createQueueMQ = (name) => new QueueMQ(name, { connection: redisOptions })

const run = async () => {
  const exampleBullName = 'ExampleBull'
  const exampleBull = createQueue3(exampleBullName)
  const exampleBullMqName = 'ExampleBullMQ'
  const exampleBullMq = createQueueMQ(exampleBullMqName)

  setQueues([new BullMQAdapter(exampleBullMq)])

  exampleBull.process(async (job) => {
    for (let i = 0; i <= 100; i++) {
      await sleep(Math.random())
      job.progress(i)
      if (Math.random() * 200 < 1) throw new Error(`Random error ${i}`)
    }
  })

  const queueScheduler = new QueueScheduler(exampleBullMqName, {
    connection: redisOptions,
  })
  await queueScheduler.waitUntilReady()

  new Worker(exampleBullMqName, async (job) => {
    for (let i = 0; i <= 100; i++) {
      await sleep(Math.random())
      await job.updateProgress(i)

      if (Math.random() * 200 < 1) throw new Error(`Random error ${i}`)

      return { jobId: `This is the return value of job (${job.id})` }
    }
  })

  app.use('/add', (req, res) => {
    const opts = req.query.opts || {}

    exampleBull.add({ title: req.query.title }, opts)
    exampleBullMq.add('Add', { title: req.query.title }, opts)

    res.json({
      ok: true,
    })
  })

  app.use('/ui', router)
  app.listen(3000, () => {
    console.log('Running on 3000...')
    console.log('For the UI, open http://localhost:3000/ui')
    console.log('Make sure Redis is running on port 6379 by default')
    console.log('To populate the queue, run:')
    console.log('  curl http://localhost:3000/add?title=Example')
    console.log('To populate the queue with custom options (opts), run:')
    console.log('  curl http://localhost:3000/add?title=Test&opts[delay]=900')
  })
}

run()
