const { Queue: QueueMQ, Worker } = require('bullmq');
const fastify = require('fastify');
const { cookieAuth } = require('./cookieAuth');

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
    {
      connection: redisOptions,
    }
  );
}

const run = async () => {
  const exampleBullMq1 = createQueueMQ('BullMQ1');
  const exampleBullMq2 = createQueueMQ('BullMQ2');

  await setupBullMQProcessor(exampleBullMq1.name);
  await setupBullMQProcessor(exampleBullMq2.name);

  const app = fastify();

  app.register(cookieAuth, { queues: [exampleBullMq1, exampleBullMq2] });

  app.get('/add', (req, reply) => {
    const opts = req.query.opts || {};
    const queue = req.query.queue === '1' ? exampleBullMq1 : exampleBullMq2;

    if (opts.delay) {
      opts.delay = +opts.delay * 1000; // delay must be a number
    }

    queue.add('Add', { title: req.query.title }, opts);

    reply.send({
      ok: true,
      queue: queue.name,
    });
  });

  await app.listen({ port: 3000 });
  // eslint-disable-next-line no-console
  console.log('Running on 3000...');
  console.log('For the UI with cookie auth, open http://localhost:3000/cookie/login');
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
