const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { FastifyAdapter } = require('@bull-board/fastify');
const { Queue: QueueMQ, Worker } = require('bullmq');
const fastify = require('fastify');

const sleep = (t) => new Promise((resolve) => setTimeout(resolve, t * 1000));

const redisOptions = {
  port: process.env.REDIS_PORT || 6379,
  host: process.env.REDIS_HOST || 'localhost',
  password: process.env.REDIS_PASS || '',
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

const readQueuesFromEnv = () => {
  const qStr = process.env.BULL_QUEUE_NAMES_CSV
  try {
    const qs = qStr.split(',')
    return qs.map(q => q.trim())
  } catch (e) {
    return []
  }
}

const run = async () => {
  const queues = readQueuesFromEnv().map(q => createQueueMQ(q))

  queues.forEach(async q => {
    await setupBullMQProcessor(q.name);
  });

  const app = fastify();

  const serverAdapter = new FastifyAdapter();

  createBullBoard({
    queues: queues.map(q => new BullMQAdapter(q)),
    serverAdapter,
  });

  serverAdapter.setBasePath('/ui');
  app.register(serverAdapter.registerPlugin(), { prefix: '/ui' });

  app.get('/add', (req, reply) => {
    const opts = req.query.opts || {};

    if (opts.delay) {
      opts.delay = +opts.delay * 1000; // delay must be a number
    }

    exampleBullMq.add('Add', { title: req.query.title }, opts);

    reply.send({
      ok: true,
    });
  });

  await app.listen({ host: '0.0.0.0', port: 3000 });
  // eslint-disable-next-line no-console
  console.log(`*** Details assume you have launched from docker-compose ***`);
  console.log(`For the UI, open http://localhost:3333/ui`);
  console.log('Make sure Redis is configured in env variables. See .env.example');
  console.log('To populate the queue, run:');
  console.log('  curl http://localhost:3333/add?title=Example');
  console.log('To populate the queue with custom options (opts), run:');
  console.log('  curl http://localhost:3333/add?title=Test&opts[delay]=9');
};

run().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
