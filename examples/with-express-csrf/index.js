const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter } = require('@bull-board/express');
const { Queue: QueueMQ, Worker } = require('bullmq');
const express = require('express');
const { doubleCsrf } = require('csrf-csrf');
const cookieParser = require('cookie-parser');

const sleep = (t) => new Promise((resolve) => setTimeout(resolve, t * 1000));

const connection = {
  port: 6379,
  host: 'localhost',
  password: '',
};

const createQueueMQ = (name) => new QueueMQ(name, { connection });

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
    { connection }
  );
}

const run = async () => {
  const exampleBullMq = createQueueMQ('BullMQ');

  await setupBullMQProcessor(exampleBullMq.name);

  const app = express();

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/ui');

  createBullBoard({
    queues: [new BullMQAdapter(exampleBullMq)],
    serverAdapter,
  });

  const { doubleCsrfProtection, generateToken } = doubleCsrf({
    getSecret: () => 'Secret',
    size: 64, // The size of the generated tokens in bits
    ignoredMethods: ['GET', 'HEAD', 'OPTIONS'], // A list of request methods that will not be protected.
    getTokenFromRequest: (req) => req.headers['x-xsrf-token'] || '', // axios default csrf header
    cookieName: 'x-csrf-token',
    cookieOptions: {
      secure: process.env.NODE_ENV === 'production',
    },
  });

  app.use(cookieParser());
  app.get('/ui/*', (req, res, next) => {
    if (['api', 'static'].every((part) => !req.path.includes(`/${part}/`))) {
      const token = generateToken(req, res, true);

      // set an additional cookie without httpOnly till https://github.com/Psifi-Solutions/csrf-csrf/pull/42 pr released
      // using axios csrf cookie name
      res.cookie('XSRF-TOKEN', token, {
        sameSite: 'lax',
        path: '/ui/',
        secure: process.env.NODE_ENV === 'production',
      });
    }
    next();
  });

  app.use('/ui', doubleCsrfProtection, serverAdapter.getRouter());

  app.use('/add', (req, res) => {
    const opts = req.query.opts || {};

    if (opts.delay) {
      opts.delay = +opts.delay * 1000; // delay must be a number
    }

    exampleBullMq.add('Add', { title: req.query.title }, opts);

    res.json({
      ok: true,
    });
  });

  app.listen(3000, () => {
    console.log('Running on 3000...');
    console.log('For the UI, open http://localhost:3000/ui');
    console.log('Make sure Redis is running on port 6379 by default');
    console.log('To populate the queue, run:');
    console.log('  curl http://localhost:3000/add?title=Example');
    console.log('To populate the queue with custom options (opts), run:');
    console.log('  curl http://localhost:3000/add?title=Test&opts[delay]=9');
  });
};

// eslint-disable-next-line no-console
run().catch((e) => console.error(e));
