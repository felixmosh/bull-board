import * as Bull from 'bull';
import Queue3 from 'bull';
import { Queue as QueueMQ, Worker, FlowProducer } from 'bullmq';
import express from 'express';
import { BullMQAdapter } from '@bull-board/api/src/queueAdapters/bullMQ';
import { BullAdapter } from '@bull-board/api/src/queueAdapters/bull';
import { createBullBoard } from '@bull-board/api/src';
import { ExpressAdapter } from '@bull-board/express/src';

const redisOptions = {
  port: 6379,
  host: 'localhost',
  password: '',
};

const sleep = (t: number) => new Promise((resolve) => setTimeout(resolve, t * 1000));

const createQueue3 = (name: string) => new Queue3(name, { redis: redisOptions });
const createQueueMQ = (name: string) => new QueueMQ(name, { connection: redisOptions });

function setupBullProcessor(bullQueue: Bull.Queue) {
  bullQueue.process(async (job) => {
    for (let i = 0; i <= 100; i++) {
      await sleep(Math.random());
      await job.progress(i);
      await job.log(`Processing job at interval ${i}`);
      if (Math.random() * 200 < 1) throw new Error(`Random error ${i}`);
    }

    return { jobId: `This is the return value of job (${job.id})` };
  });
}

function setupBullMQProcessor(queueName: string) {
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
  const app = express();

  const exampleBull = createQueue3('ExampleBull');
  const exampleBullMq = createQueueMQ('Examples.BullMQ');
  const newRegistration = createQueueMQ('Notifications.User.NewRegistration');
  const resetPassword = createQueueMQ('Notifications;User;ResetPassword');
  const flow = new FlowProducer({ connection: redisOptions });

  setupBullProcessor(exampleBull); // needed only for example proposes
  setupBullMQProcessor(exampleBullMq.name); // needed only for example proposes

  app.use('/add', (req, res) => {
    const opts = req.query.opts || ({} as any);

    if (opts.delay) {
      opts.delay = +opts.delay * 1000; // delay must be a number
    }

    if (opts.priority) {
      opts.priority = +opts.priority;
    }

    exampleBull.add({ title: req.query.title }, opts);
    exampleBullMq.add('Add', { title: req.query.title }, opts);
    res.json({
      ok: true,
    });
  });

  app.use('/add-flow', (req, res) => {
    const opts = req.query.opts || ({} as any);

    if (opts.delay) {
      opts.delay = +opts.delay * 1000; // delay must be a number
    }

    if (opts.priority) {
      opts.priority = +opts.priority;
    }

    flow.add({
      name: 'root-job',
      queueName: 'ExampleBullMQ',
      data: {},
      opts,
      children: [
        {
          name: 'job-child1',
          data: { idx: 0, foo: 'bar' },
          queueName: 'ExampleBullMQ',
          opts,
          children: [
            {
              name: 'job-grandchildren1',
              data: { idx: 4, foo: 'baz' },
              queueName: 'ExampleBullMQ',
              opts,
              children: [
                {
                  name: 'job-child2',
                  data: { idx: 2, foo: 'foo' },
                  queueName: 'ExampleBullMQ',
                  opts,
                  children: [
                    {
                      name: 'job-child3',
                      data: { idx: 3, foo: 'bis' },
                      queueName: 'ExampleBullMQ',
                      opts,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    res.json({
      ok: true,
    });
  });

  const serverAdapter: any = new ExpressAdapter();
  serverAdapter.setBasePath('/ui');

  createBullBoard({
    queues: [
      new BullMQAdapter(exampleBullMq, { delimiter: '.' }),
      new BullAdapter(exampleBull, { delimiter: '.' }),
      new BullMQAdapter(newRegistration, { delimiter: '.' }),
      new BullMQAdapter(resetPassword, { delimiter: ';', displayName: 'Reset Password' }),
    ],
    serverAdapter,
  });

  app.use('/ui', serverAdapter.getRouter());

  app.listen(3000, () => {
    console.log('Running on 3000...');
    console.log('For the UI, open http://localhost:3000/ui');
    console.log('Make sure Redis is running on port 6379 by default');
    console.log('To populate the queue, run:');
    console.log('  curl http://localhost:3000/add?title=Example');
    console.log('To populate the queue with custom options (opts), run:');
    console.log('  curl http://localhost:3000/add?title=Test&opts[delay]=10');
  });
};

run().catch((e) => console.error(e));
