import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { QueueScheduler, Worker } from 'bullmq';
import { MSWAdapter } from './MSWAdapter';
import MockRedis from 'ioredis-mock';
import { Queue } from 'bullmq/dist/esm/classes/queue';

const sleep = (t: number) => new Promise((resolve) => setTimeout(resolve, t * 1000));
const connection = new MockRedis();

async function setupBullMQProcessor(queueName: string) {
  const queueScheduler = new QueueScheduler(queueName, {
    connection,
  });
  await queueScheduler.waitUntilReady();

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
    { connection }
  );
}

async function main() {
  const serverAdapter = new MSWAdapter();

  const queues: Queue[] = Array.from({ length: 1 }, (_x, i) => i).map(
    (i) => new Queue(`${i + 1}`, { connection })
  );

  queues.forEach((queue) => {
    return setupBullMQProcessor(queue.name);
  });

  Array.from({ length: 1 }, (_x, i) => i).forEach((i) => {
    const q = queues[i % queues.length];
    const id = Math.floor(i * Math.random() + 23);
    // const repeat = i % 7 === 0 ? { limit: 4 } : undefined;
    const attempts = i % 3 === 0 ? 3 : undefined;
    // const delay = i % 5 === 0 ? Math.random() * 5000 + 10000 : undefined;

    q.add(`Job name - ${id}`, { id }, { attempts });
  });

  createBullBoard({
    queues: queues.map((queue, i) => {
      const readOnlyMode = i % 9 === 0 && i > 0;
      return new BullMQAdapter(queue, {
        prefix: `Example${readOnlyMode ? ' [read only]' : ''} - `,
        readOnlyMode,
      });
    }),
    serverAdapter,
  });

  await serverAdapter.init();
}

main().catch(console.error);
