const { createBullBoard } = require('@sinianluoye/bull-board-api');
const { BullMQAdapter } = require('@sinianluoye/bull-board-api/bullMQAdapter');
const { HonoAdapter } = require('@sinianluoye/bull-board-hono');
const { Queue: QueueMQ, Worker } = require('@sinianluoye/bullmq');
const { Hono } = require('hono');
const { showRoutes } = require('hono/dev');
const { serve } = require('@hono/node-server');
const { serveStatic } = require('@hono/node-server/serve-static');

const sleep = (t) => new Promise((resolve) => setTimeout(resolve, t * 1000));

const redisOptions = {
  port: 6379,
  host: 'localhost',
  password: '',
  tls: false,
};

const createQueueMQ = (name) => new QueueMQ(name, { connection: redisOptions });

async function setupBullMQProcessor(queueName) {
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

  const app = new Hono();

  const serverAdapter = new HonoAdapter(serveStatic);

  createBullBoard({
    queues: [new BullMQAdapter(exampleBullMq)],
    serverAdapter,
  });

  const basePath = '/ui'
  serverAdapter.setBasePath(basePath);
  app.route(basePath, serverAdapter.registerPlugin());
  
  app.get('/add', async (c) => {
    await exampleBullMq.add('Add', { title: c.req.query('title') });

    return c.json({ ok: true })
  });

  showRoutes(app);

  serve({ fetch: app.fetch, port: 3000 }, ({ address, port }) => {
    /* eslint-disable no-console */
    console.log(`Running on ${address}:${port}...`);
    console.log(`For the UI of instance1, open http://localhost:${port}/ui`);
    console.log('Make sure Redis is running on port 6379 by default');
    console.log('To populate the queue, run:');
    console.log(`  curl http://localhost:${port}/add?title=Example`);
    /* eslint-enable */
  })
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
