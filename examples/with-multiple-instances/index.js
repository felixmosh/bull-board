const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter } = require('@bull-board/express');
const { Queue: QueueMQ, Worker } = require('bullmq');
const express = require('express');

const sleep = (t) => new Promise((resolve) => setTimeout(resolve, t * 1000));

const connection = {
  port: 6379,
  host: 'localhost',
  password: '',
  tls: false,
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
  const exampleBullMq = createQueueMQ('BullMQ - instance1');
  const exampleBullMq2 = createQueueMQ('BullMQ - instance2');

  await setupBullMQProcessor(exampleBullMq.name);
  await setupBullMQProcessor(exampleBullMq2.name);

  const app = express();
  // Configure view engine to render EJS templates.
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');

  const serverAdapter1 = new ExpressAdapter();
  const serverAdapter2 = new ExpressAdapter();

  createBullBoard({
    queues: [new BullMQAdapter(exampleBullMq)],
    serverAdapter: serverAdapter1,
  });

  createBullBoard({
    queues: [new BullMQAdapter(exampleBullMq2)],
    serverAdapter: serverAdapter2,
  });

  serverAdapter1.setBasePath('/instance1');
  serverAdapter2.setBasePath('/instance2');

  app.use('/instance1', serverAdapter1.getRouter());
  app.use('/instance2', serverAdapter2.getRouter());

  app.use('/add', (req, res) => {
    const opts = req.query.opts || {};

    if (opts.delay) {
      opts.delay = +opts.delay * 1000; // delay must be a number
    }

    exampleBullMq.add('Add instance 1', { title: req.query.title }, opts);
    exampleBullMq2.add('Add instance 2', { title: req.query.title }, opts);

    res.json({
      ok: true,
    });
  });

  app.listen(3000, () => {
    console.log('Running on 3000...');
    console.log('For the UI of instance1, open http://localhost:3000/instance1');
    console.log('For the UI of instance2, open http://localhost:3000/instance2');
    console.log('Make sure Redis is running on port 6379 by default');
    console.log('To populate the queue, run:');
    console.log('  curl http://localhost:3000/add?title=Example');
    console.log('To populate the queue with custom options (opts), run:');
    console.log('  curl http://localhost:3000/add?title=Test&opts[delay]=9');
  });
};

// eslint-disable-next-line no-console
run().catch((e) => console.error(e));
