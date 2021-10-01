const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { FastifyAdapter } = require('@bull-board/fastify');
const { Queue, Worker, QueueScheduler } = require('bullmq');
const fastify = require('fastify');

// Consider to use IORedis.
// Look at this to get more information: https://docs.bullmq.io/guide/connections
const redisOptions = {
  port: 6379,
  host: 'localhost',
  password: '',
  tls: false,
};

// Define your queue.
// Docs: https://docs.bullmq.io/guide/queues
const queue = new Queue(name, { connection: redisOptions });

// It's required to have at least one scheduler.
// Docs: https://docs.bullmq.io/guide/queuescheduler
const queueScheduler = new QueueScheduler(queue.name, { connection: redisOptions });

// Define the worker that will handle queue.
const worker = new Worker(queue.name, job => {
  console.log("Start handling the job. Id: " + job.id)
  
  return new Promise(resolve => {
    
    // Simple example. Wait for 5 seconds and complete the task.
    setTimeout(() => { 
      console.log("Finish handling the job. Id: " + job.id)
      resolve({ jobId: `This is the return value of job (${job.id})` })
    }, 5000)
    
  })
});

const run = async () => {
  await queueScheduler.waitUntilReady();

  const server = fastify();
  const serverAdapter = new FastifyAdapter();
  serverAdapter.setBasePath('/ui');
  server.register(serverAdapter.registerPlugin(), { prefix: '/ui' });

  createBullBoard({
    queues: [new BullMQAdapter(queue)],
    serverAdapter,
  });

  server.get('/add', async (req, reply) => {
    const opts = req.query.opts || {};
    await queue.add('Job Name', { title: req.query.title }, opts);
    return { status: "success" };
  });

  await server.listen(3000);
  
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
