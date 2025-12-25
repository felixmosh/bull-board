import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { BunAdapter } from '@bull-board/bun';
import { Queue as QueueMQ, Worker } from 'bullmq';

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

const basePath = '/ui';

// Create a wrapper fetch function that handles routing
const bunFetch = serverAdapter.registerPlugin();

const server = Bun.serve({
  port: 3000,
  async fetch(request) {
    const url = new URL(request.url);
    
    // Handle /add endpoint
    if (url.pathname === '/add' && request.method === 'GET') {
      const title = url.searchParams.get('title') || 'Default Job';
      await exampleBullMq.add('Add', { title });
      
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // Handle bull-board routes
    if (url.pathname.startsWith(basePath)) {
      return bunFetch(request);
    }
    
    // Root path redirect
    if (url.pathname === '/') {
      return Response.redirect(`http://localhost:3000${basePath}`, 302);
    }
    
    return new Response('Not Found', { status: 404 });
  },
});

/* eslint-disable no-console */
console.log(`Running on http://localhost:${server.port}...`);
console.log(`For the UI, open http://localhost:${server.port}${basePath}`);
console.log('Make sure Redis is running on port 6379 by default');
console.log('To populate the queue, run:');
console.log(`  curl http://localhost:${server.port}/add?title=Example`);
/* eslint-enable no-console */
