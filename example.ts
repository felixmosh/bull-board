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

async function setupBullMQProcessor(queueName: string) {
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

  const exampleBull1 = createQueue3('ExampleBull1');
  const exampleBullMq1 = createQueueMQ('ExampleBullMQ1');
  const exampleBull2 = createQueue3('ExampleBull2');
  const exampleBullMq2 = createQueueMQ('ExampleBullMQ2');
  const exampleBull3 = createQueue3('ExampleBull3');
  const exampleBullMq3 = createQueueMQ('ExampleBullMQ3');
  const exampleBull4 = createQueue3('ExampleBull4');
  const exampleBullMq4 = createQueueMQ('ExampleBullMQ4');
  const exampleBull5 = createQueue3('ExampleBull5');
  const exampleBullMq5 = createQueueMQ('ExampleBullMQ5');
  const exampleBull6 = createQueue3('ExampleBull6');
  const exampleBullMq6 = createQueueMQ('ExampleBullMQ6');
  const exampleBull7 = createQueue3('ExampleBull7');
  const exampleBullMq7 = createQueueMQ('ExampleBullMQ7');
  const exampleBull8 = createQueue3('ExampleBull8');
  const exampleBullMq8 = createQueueMQ('ExampleBullMQ8');
  const flow = new FlowProducer({ connection: redisOptions });

  await setupBullProcessor(exampleBull1); // needed only for example proposes
  await setupBullMQProcessor(exampleBullMq1.name); // needed only for example proposes
  await setupBullProcessor(exampleBull2); // needed only for example proposes
  await setupBullMQProcessor(exampleBullMq2.name); // needed only for example proposes
  await setupBullProcessor(exampleBull3); // needed only for example proposes
  await setupBullMQProcessor(exampleBullMq3.name); // needed only for example proposes
  await setupBullProcessor(exampleBull4); // needed only for example proposes
  await setupBullMQProcessor(exampleBullMq4.name); // needed only for example proposes
  await setupBullProcessor(exampleBull5); // needed only for example proposes
  await setupBullMQProcessor(exampleBullMq5.name); // needed only for example proposes
  await setupBullProcessor(exampleBull6); // needed only for example proposes
  await setupBullMQProcessor(exampleBullMq6.name); // needed only for example proposes
  await setupBullProcessor(exampleBull7); // needed only for example proposes
  await setupBullMQProcessor(exampleBullMq7.name); // needed only for example proposes
  await setupBullProcessor(exampleBull8); // needed only for example proposes
  await setupBullMQProcessor(exampleBullMq8.name); // needed only for example proposes

  app.use('/add', (req, res) => {
    const opts = req.query.opts || ({} as any);

    if (opts.delay) {
      opts.delay = +opts.delay * 1000; // delay must be a number
    }

    if (opts.priority) {
      opts.priority = +opts.priority;
    }

    exampleBull1.add({ title: req.query.title }, opts);
    exampleBullMq1.add('Add', { title: req.query.title }, opts);
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
      new BullMQAdapter(exampleBullMq1, { category: 'Category 1' }),
      new BullAdapter(exampleBull1, { category: 'Category 1' }),
      new BullMQAdapter(exampleBullMq2, { category: 'Category 1' }),
      new BullAdapter(exampleBull2, { category: 'Category 1' }),
      new BullMQAdapter(exampleBullMq3, { category: 'Category 1' }),
      new BullAdapter(exampleBull3, { category: 'Category 1' }),
      new BullMQAdapter(exampleBullMq4, { category: 'Category 2' }),
      new BullAdapter(exampleBull4, { category: 'Category 2' }),
      new BullMQAdapter(exampleBullMq5, { category: 'Category 2' }),
      new BullAdapter(exampleBull5, { category: 'Category 3' }),
      new BullMQAdapter(exampleBullMq6, { category: 'Category 3' }),
      new BullAdapter(exampleBull6, { category: 'Category 3' }),
      new BullMQAdapter(exampleBullMq7),
      new BullAdapter(exampleBull7),
      new BullMQAdapter(exampleBullMq8),
      new BullAdapter(exampleBull8),
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
