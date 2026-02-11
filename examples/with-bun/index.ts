import { createBullBoard } from '@sinianluoye/bull-board-api';
import { BullMQAdapter } from '@sinianluoye/bull-board-api/bullMQAdapter';
import { BunAdapter } from '@sinianluoye/bull-board-bun';
import { Queue as QueueMQ, Worker } from '@sinianluoye/bullmq';

const sleep = (t: number) => new Promise((resolve) => setTimeout(resolve, t * 1000));

const redisOptions = {
  port: 6379,
  host: 'localhost',
  password: '',
};

const createQueueMQ = (name: string) => new QueueMQ(name, { connection: redisOptions });

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

const exampleBullMq = createQueueMQ('BullMQ');

setupBullMQProcessor(exampleBullMq.name);

const serverAdapter = new BunAdapter();
serverAdapter.setBasePath('/ui');

createBullBoard({
  queues: [new BullMQAdapter(exampleBullMq)],
  serverAdapter,
});

// Get bull-board routes
const bullBoardRoutes = serverAdapter.getRoutes();

// Start Bun server with routes
Bun.serve({
  port: 3000,
  routes: {
    // Custom health check route
    "/health": {
      GET: () => Response.json({ status: 'ok', timestamp: new Date().toISOString() }),
    },
    // Custom add job route
    "/add": {
      GET: async (request) => {
        const url = new URL(request.url);
        const title = url.searchParams.get('title') || 'Default Job';
        await exampleBullMq.add('Add', { title });
        return Response.json({ ok: true });
      },
    },
    // Spread bull-board routes
    ...bullBoardRoutes,
  },
});

/* eslint-disable no-console */
console.log('Running on http://localhost:3000...');
console.log(`For the UI, open http://localhost:3000/ui`);
console.log('Make sure Redis is running on port 6379 by default');
console.log('To populate the queue, run:');
console.log(`  curl http://localhost:3000/add?title=Example`);
/* eslint-enable no-console */
