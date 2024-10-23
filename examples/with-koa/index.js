const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { KoaAdapter } = require('@bull-board/koa');
const { Queue: QueueMQ, Worker } = require('bullmq');
const Koa = require('koa');
const Router = require('koa-router');

const sleep = (t) => new Promise((resolve) => setTimeout(resolve, t * 1000));

const redisOptions = {
  port: 6379,
  host: 'localhost',
  password: '',
  tls: false,
};

const createQueueMQ = (name) => new QueueMQ(name, { connection: redisOptions });

function setupBullMQProcessor(queueName) {
  new Worker(
    queueName,
    async (job) => {
      for (let i = 0; i <= 100; i++) {
        await sleep(Math.random());
        await job.updateProgress(i);
        await job.log(`Processing job at interval ${i}`);

        if (Math.random() * 200 < 1) throw new Error(`Random error ${i}`);
      }

      return { jobId: `This is the return value of job (${job.id})` };
    },
    { connection: redisOptions }
  );
}

const run = async () => {
  const exampleBullMq = createQueueMQ('BullMQ');

  await setupBullMQProcessor(exampleBullMq.name);

  const app = new Koa();
  const router = new Router();

  const serverAdapter = new KoaAdapter();

  createBullBoard({
    queues: [new BullMQAdapter(exampleBullMq)],
    serverAdapter,
  });

  serverAdapter.setBasePath('/ui');
  await app.use(serverAdapter.registerPlugin());

  router.get('/add', async (ctx) => {
    const opts = ctx.query.opts || {};

    if (opts.delay) {
      opts.delay = +opts.delay * 1000; // delay must be a number
    }

    await exampleBullMq.add('Add', { title: ctx.query.title }, opts);

    ctx.body = {
      ok: true,
    };
  });

  app.use(router.routes()).use(router.allowedMethods());

  await app.listen(3000);
  // eslint-disable-next-line no-console
  console.log('Running on 3000...');
  console.log('For the UI, open http://localhost:3000/ui');
  console.log('Make sure Redis is running on port 6379 by default');
  console.log('To populate the queue, run:');
  console.log('  curl http://localhost:3000/add?title=Example');
  console.log('To populate the queue with custom options (opts), run:');
  console.log('  curl http://localhost:3000/add?title=Test&opts[delay]=9');
};

run().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
