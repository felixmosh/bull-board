const Koa = require('koa')
const app = new Koa()
const Router = require('koa-router')

const { setQueues, mountKoa } = require('./dist/index')
const { Queue: QueueMQ, Worker } = require('bullmq')
const Queue3 = require('bull')

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
  const exampleBullName = 'ExampleBull'
  const exampleBull = createQueue3(exampleBullName)
  const exampleBullMqName = 'ExampleBullMQ'
  const exampleBullMq = createQueueMQ(exampleBullMqName)

  setQueues([exampleBullMq])

  exampleBull.process(async job => {
    for (let i = 0; i <= 100; i++) {
      await sleep(Math.random())
      job.progress(i)
      if (Math.random() * 200 < 1) throw new Error(`Random error ${i}`)
    }
  })

  new Worker(exampleBullMqName, async job => {
    for (let i = 0; i <= 100; i++) {
      await sleep(Math.random())
      await job.updateProgress(i)

      if (Math.random() * 200 < 1) throw new Error(`Random error ${i}`)
    }
  })
  const router = new Router()
  router.get('/add', async (ctx, next) => {
    const opts = ctx.query.opts || {};

    exampleBull.add({ title: ctx.query.title }, opts)
    exampleBullMq.add('Add', { title: ctx.query.title }, opts)

    ctx.body = { ok: true, }
  })
  const ui = new Router({prefix: '/ui'})
  ui.all('(.*)', async (ctx, next) => {
    if (ctx.status === 404 || ctx.status === '404') {
        delete ctx.res.statusCode
    }
    ctx.respond = false;
    mountKoa('/ui', ctx.req, ctx.res);
  })

  app.use(router.routes(), router.allowedMethods())
  app.use(ui.routes(), ui.allowedMethods())
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
