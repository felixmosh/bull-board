const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { HapiAdapter } = require('@bull-board/hapi');
const { Queue: QueueMQ, Worker, QueueScheduler } = require('bullmq');
const Hapi = require('@hapi/hapi');

const sleep = (t) => new Promise((resolve) => setTimeout(resolve, t * 1000));

const redisOptions = {
  port: 6379,
  host: 'localhost',
  password: '',
  tls: false,
};

const createQueueMQ = (name) => new QueueMQ(name, { connection: redisOptions });

async function setupBullMQProcessor(queueName) {
  const queueScheduler = new QueueScheduler(queueName, {
    connection: redisOptions,
  });
  await queueScheduler.waitUntilReady();

  new Worker(queueName, async (job) => {
    for (let i = 0; i <= 100; i++) {
      await sleep(Math.random());
      await job.updateProgress(i);
      await job.log(`Processing job at interval ${i}`);

      if (Math.random() * 200 < 1) throw new Error(`Random error ${i}`);
    }

    return { jobId: `This is the return value of job (${job.id})` };
  });
}

async function validate(request, username, password) {
  const isValid = username === 'bull' && password === 'board';

  return { isValid, credentials: { username } };
}

const run = async () => {
  const exampleBullMq = createQueueMQ('BullMQ');

  await setupBullMQProcessor(exampleBullMq.name);

  const app = Hapi.server({
    port: 3000,
    host: 'localhost',
  });

  await app.register(require('@hapi/basic'));
  app.auth.strategy('simple', 'basic', { validate });

  const serverAdapter = new HapiAdapter();

  createBullBoard({
    queues: [new BullMQAdapter(exampleBullMq)],
    serverAdapter,
  });

  serverAdapter.setBasePath('/ui');
  await app.register(
    { plugin: serverAdapter.registerPlugin(), options: { auth: 'simple' } },
    {
      routes: { prefix: '/ui' },
    }
  );

  app.route({
    method: 'GET',
    path: '/add',
    handler: (req) => {
      const opts = req.query.opts || {};

      if (opts.delay) {
        opts.delay = +opts.delay * 1000; // delay must be a number
      }

      exampleBullMq.add('Add', { title: req.query.title }, opts);

      return {
        ok: true,
      };
    },
  });

  await app.start();
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
