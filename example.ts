// oxlint-disable no-console
import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { MetricsRecorder, RedisMetricsHistoryProvider } from '@bull-board/metrics';
import * as Bull from 'bull';
import Queue3 from 'bull';
import { FlowProducer, JobsOptions, MetricsTime, Queue as QueueMQ, Worker } from 'bullmq';
import express from 'express';

const redisOptions = {
  port: 6379,
  host: 'localhost',
  password: '',
};

const sleep = (t: number) => new Promise((resolve) => setTimeout(resolve, t * 1000));
const randomInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

const createQueue3 = (name: string) =>
  new Queue3(name, { redis: redisOptions, metrics: { maxDataPoints: MetricsTime.ONE_WEEK } });
const createQueueMQ = (name: string, defaultJobOptions?: JobsOptions) =>
  new QueueMQ(name, { connection: redisOptions, defaultJobOptions });

function setupBullProcessor(bullQueue: Bull.Queue) {
  bullQueue.process(async (job) => {
    for (let i = 0; i <= 100; i++) {
      await sleep(Math.random());
      const message = `Processing job at interval ${i}`;
      await job.progress({ progress: i, message });
      await job.log(message);
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
        const message = `Processing job at interval ${i}`;
        await job.updateProgress({ progress: i, message });
        await job.log(message);

        if (Math.random() * 200 < 1) throw new Error(`Random error ${i}`);
      }

      return { jobId: `This is the return value of job (${job.id})` };
    },
    {
      connection: redisOptions,
      metrics: {
        maxDataPoints: MetricsTime.ONE_WEEK,
      },
    }
  );
}

function setupSimWorker(queueName: string) {
  return new Worker(
    queueName,
    async (job) => {
      await sleep(0.4 + Math.random() * 1.6);
      await job.updateProgress(randomInt(0, 100));
      if (Math.random() < 0.18) throw new Error('Simulated downstream error');
      return { ok: true };
    },
    {
      connection: redisOptions,
      concurrency: 2,
      metrics: { maxDataPoints: MetricsTime.ONE_WEEK },
    }
  );
}

async function seedQueue(queue: QueueMQ) {
  const backlog = randomInt(30, 110);
  const delayed = randomInt(4, 14);
  await queue.addBulk(
    Array.from({ length: backlog }, (_, i) => ({ name: 'process', data: { seq: i } }))
  );
  await queue.addBulk(
    Array.from({ length: delayed }, (_, i) => ({
      name: 'scheduled',
      data: { seq: i },
      opts: { delay: 60 * 60 * 1000 },
    }))
  );
}

const retrying = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: 500,
  removeOnFail: 1000,
};
const fireAndForget = { attempts: 1, removeOnComplete: 200, removeOnFail: 200 };

const groupedQueueDefs: Array<[string, JobsOptions?]> = [
  ['Emails.Transactional.Welcome', retrying],
  ['Emails.Transactional.PasswordReset', retrying],
  ['Emails.Transactional.Receipt', retrying],
  ['Emails.Marketing.Digest', fireAndForget],
  ['Emails.Marketing.Promotions', fireAndForget],
  ['Media.Image.Resize', { attempts: 5, removeOnComplete: 500 }],
  ['Media.Image.Optimize', { attempts: 5, removeOnComplete: 500 }],
  [
    'Media.Video.Transcode',
    { attempts: 2, backoff: { type: 'fixed', delay: 5000 }, removeOnComplete: 200 },
  ],
  ['Media.Video.Thumbnail', { attempts: 3, removeOnComplete: 200 }],
  ['Payments.Charge', retrying],
  ['Payments.Refund', retrying],
  [
    'Payments.Payout',
    {
      attempts: 10,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 500,
      removeOnFail: 1000,
    },
  ],
  ['Payments.Invoice', { attempts: 3, removeOnComplete: 500 }],
  ['Notifications.Push', fireAndForget],
  ['Notifications.Sms', { attempts: 2, removeOnComplete: 200 }],
  ['Webhooks.Outbound', { attempts: 8, removeOnComplete: 1000 }],
  ['Webhooks.DeadLetter', { attempts: 1, removeOnComplete: 500 }],
  ['Search.Reindex', { removeOnComplete: 200 }],
  ['Search.IndexUpdate', { attempts: 2, removeOnComplete: 200 }],
];

const run = async () => {
  const app = express();

  const ordersFulfillment = createQueueMQ('Orders.Fulfillment', retrying);
  const reportsExport = createQueue3('Reports.NightlyExport');
  const flow = new FlowProducer({ connection: redisOptions });

  setupBullProcessor(reportsExport);
  setupBullMQProcessor(ordersFulfillment.name);

  const newRegistration = createQueueMQ('Notifications.User.NewRegistration', { attempts: 2 });
  const resetPassword = createQueueMQ('Notifications;User;ResetPassword', { attempts: 2 });

  const groupedQueues = groupedQueueDefs.map(([name, opts]) => createQueueMQ(name, opts));
  const simQueues = [...groupedQueues, newRegistration, resetPassword];

  simQueues.forEach((queue) => setupSimWorker(queue.name));
  await Promise.all(simQueues.map(seedQueue));

  await groupedQueues.find((queue) => queue.name === 'Webhooks.DeadLetter')?.pause();
  await groupedQueues.find((queue) => queue.name === 'Search.Reindex')?.pause();

  app.use('/add', (req, res) => {
    const opts = req.query.opts || ({} as any);

    if (opts.delay) {
      opts.delay = +opts.delay * 1000; // delay must be a number
    }

    if (opts.priority) {
      opts.priority = +opts.priority;
    }

    reportsExport.add({ title: req.query.title }, opts);
    ordersFulfillment.add('Add', { title: req.query.title }, opts);
    res.json({
      ok: true,
    });
  });

  app.use('/add-scheduled-job', async (req, res) => {
    const opts = req.query.opts || ({} as any);

    await ordersFulfillment.upsertJobScheduler(
      'my-scheduler-id',
      {
        every: +(opts.every || 1) * 1000,
        limit: +opts.limit || 4,
      },
      { name: req.query.title as string, opts }
    );

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
      queueName: 'Orders.Fulfillment',
      data: {},
      opts,
      children: [
        {
          name: 'job-child1',
          data: { idx: 0, foo: 'bar' },
          queueName: 'Orders.Fulfillment',
          opts,
          children: [
            {
              name: 'job-grandchildren1',
              data: { idx: 4, foo: 'baz' },
              queueName: 'Orders.Fulfillment',
              opts,
              children: [
                {
                  name: 'job-child2',
                  data: { idx: 2, foo: 'foo' },
                  queueName: 'Orders.Fulfillment',
                  opts,
                  children: [
                    {
                      name: 'job-child3',
                      data: { idx: 3, foo: 'bis' },
                      queueName: 'Orders.Fulfillment',
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

  const bullMQAdapters = [
    new BullMQAdapter(ordersFulfillment, { delimiter: '.' }),
    ...groupedQueues.map((queue) => new BullMQAdapter(queue, { delimiter: '.' })),
    new BullMQAdapter(newRegistration, { delimiter: '.' }),
    new BullMQAdapter(resetPassword, {
        delimiter: ';',
        displayName: 'Reset Password',
        description: 'Sends a password-reset email to the requesting user.',
        jobDataSchema: {
          type: 'object',
          additionalProperties: false,
          required: ['userId', 'email'],
          properties: {
            userId: { type: 'string', description: 'Internal id of the user requesting the reset.' },
            email: {
              type: 'string',
              format: 'email',
              description: 'Address the reset link is sent to.',
            },
            locale: {
              type: 'string',
              description: 'BCP-47 locale for the email template.',
              default: 'en',
            },
          },
        },
    }),
  ];

  const historyProvider = new RedisMetricsHistoryProvider({ connection: redisOptions });
  const recorder = new MetricsRecorder({ queues: bullMQAdapters, connection: redisOptions });
  recorder.start();

  createBullBoard({
    queues: [
      ...bullMQAdapters,
      new BullAdapter(reportsExport, {
        delimiter: '.',
        externalJobUrl: (job) => ({ href: `https://my-app.com/${job.id}` }),
      }),
    ],
    serverAdapter,
    options: {
      uiConfig: {
        showMetrics: true,
        overview: { groupByDelimiter: true },
      },
      historyProvider,
    },
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
