import { createApp, createRouter, eventHandler } from 'h3';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { H3Adapter } from '@bull-board/h3';
import { Queue as QueueMQ, RedisOptions, Worker } from 'bullmq';

const sleep = (t) => new Promise((resolve) => setTimeout(resolve, t * 1000));

const serverAdapter = new H3Adapter();
serverAdapter.setBasePath('/ui');

export const app = createApp();

const router = createRouter();

app.use(router);
app.use(serverAdapter.registerHandlers());

const redisOptions: RedisOptions = {
  port: 6379,
  host: 'localhost',
  password: '',
};

const createQueueMQ = (name: string) => new QueueMQ(name, { connection: redisOptions });

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

const exampleBullMq = createQueueMQ('BullMQ');
setupBullMQProcessor(exampleBullMq.name);

createBullBoard({
  queues: [new BullMQAdapter(exampleBullMq)],
  serverAdapter,
});

router.use(
  '/add',
  eventHandler(async () => {
    await exampleBullMq.add('myJob', { foo: 'bar' });

    return true;
  })
);
