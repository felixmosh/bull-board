const { createQueues, UI } = require('./')
const app = require('express')()

const sleep = t => new Promise(resolve => setTimeout(resolve, t * 1000))

const redisOptions = {
  redis: {
    port: 6379,
    host: 'localhost',
    password: '',
    tls: false,
  },
}

const run = () => {
  const queues = createQueues(redisOptions)

  const example = queues.add('example')

  example.process(async job => {
    for (let i = 0; i <= 100; i++) {
      await sleep(Math.random())
      job.progress(i)
      if (Math.random() * 200 < 1) throw new Error(`Random error ${i}`)
    }
  })

  app.use('/add', (req, res) => {
    example.add({ title: req.query.title })
    res.json({ ok: true })
  })

  app.use('/ui', UI)
  app.listen(3000, () => {
    console.log('Running on 3000...')
    console.log('For the UI, open http://localhost:3000/ui')
    console.log('Make sure Redis is running on port 6379 by default')
    console.log('To populate the queue, run:')
    console.log('  curl http://localhost:3000/add?title=Example')
  })
}

run()
