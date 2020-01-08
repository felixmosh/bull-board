const { setQueues, UI } = require('./')
const { Queue3 } = require('bullmq/dist/classes/compat')
const Queue = require('bull')
const app = require('express')()

const sleep = t => new Promise(resolve => setTimeout(resolve, t * 1000))

const redisOptions = {
  port: 6379,
  host: 'localhost',
  password: '',
  tls: false,
}

const createQueue = name => new Queue(name, { redis: redisOptions })
const createQueue4 = name => new Queue3(name, { connection: redisOptions })

const run = () => {
  const example = createQueue('ExampleBull')
  const exampleMQ = createQueue4('ExampleBullMQ')

  setQueues([example, exampleMQ])

  example.process(async job => {
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
    example.add({ title: req.query.title })
    exampleMQ.add('Add', { title: req.query.title })
    res.json({ ok: true })
  })

  app.use('/ui', UI)
  app.listen(3002, () => {
    console.log('Running on 3000...')
    console.log('For the UI, open http://localhost:3000/ui')
    console.log('Make sure Redis is running on port 6379 by default')
    console.log('To populate the queue, run:')
    console.log('  curl http://localhost:3000/add?title=Example')
  })
}

run()
