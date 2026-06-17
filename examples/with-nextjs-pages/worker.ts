import { Worker } from 'bullmq';
import { queueName, redisOptions } from './lib/queue';

// Workers can't run in serverless — run this as its own always-on process.

const sleep = (t: number) => new Promise((resolve) => setTimeout(resolve, t * 1000));

const worker = new Worker(
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

worker.on('ready', () => console.log('Worker is ready, processing jobs...'));
worker.on('failed', (job, err) => console.error(`Job ${job?.id} failed:`, err.message));
