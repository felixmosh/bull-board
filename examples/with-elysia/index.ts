import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ElysiaAdapter } from '@bull-board/elysia';
import { Queue as QueueMQ, Worker } from 'bullmq';
import Elysia from 'elysia';

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

const serverAdapter = new ElysiaAdapter('/ui');

createBullBoard({
  queues: [new BullMQAdapter(exampleBullMq)],
  serverAdapter,
  options: {
    // This configuration fixes a build error on Bun caused by eval (https://github.com/oven-sh/bun/issues/5809#issuecomment-2065310008)
    uiBasePath: 'node_modules/@bull-board/ui',
  }
});

const app = new Elysia()
  .onError(({ error, code, request }) => {
    console.error(error, code, request.method, request.url);
    if (code === 'NOT_FOUND') return 'NOT_FOUND';
  })
  .use(serverAdapter.registerPlugin())
  .get('/add', async ({ query }) => {
    await exampleBullMq.add('Add', { title: query.title });

    return { ok: true };
  });

app.listen(3000, ({ port, url }) => {
  /* eslint-disable no-console */
  console.log(`Running on ${url.hostname}:${port}...`);
  console.log(`For the UI of instance1, open http://localhost:${port}/ui`);
  console.log('Make sure Redis is running on port 6379 by default');
  console.log('To populate the queue, run:');
  console.log(`  curl http://localhost:${port}/add?title=Example`);
  /* eslint-enable no-console */
});
