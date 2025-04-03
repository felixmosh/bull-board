const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { BunAdapter } = require('@bull-board/bun');
const { Queue: QueueMQ, Worker } = require('bullmq');


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
    { connection: redisOptions }
  );
}

const exampleBullMq = createQueueMQ('BullMQ');

await setupBullMQProcessor(exampleBullMq.name);
const serverAdapter = new BunAdapter();
serverAdapter.setBasePath('/ui');
createBullBoard({
  queues: [new BullMQAdapter(exampleBullMq)],
  serverAdapter,
});

const server = Bun.serve({
  routes: {
    ...bunAdapter.routes,
    "/add": {
      "POST": async (req) => {
        const body = await req.json().catch(()=>null)
        if (!body) {
          console.warn("No body in request");
          return new Response("No body", { status: 400 });
        }
        await exampleBullMq.add('Add', { title: req.query.title });
        return new Response("ok");
      },
    }
  },

  error(error) {
    console.error(error);
    return new Response("Internal Server Error", { status: 500 });
  },
});

console.log(`Listening on ${server.hostname}:${server.port}`);
console.log('For the UI, open http://localhost:3000/ui');
console.log('Make sure Redis is running on port 6379 by default');
console.log('To populate the queue, run:');
console.log('  curl http://localhost:3000/add?title=Example');
console.log('To populate the queue with custom options (opts), run:');
console.log('  curl http://localhost:3000/add?title=Test&opts[delay]=9');