import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import request from 'supertest';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: +(process.env.REDIS_PORT || 6379),
};

async function fetchQueue(serverAdapter: ExpressAdapter, queueName: string) {
  const res = await request(serverAdapter.getRouter()).get('/api/queues').expect(200);
  return JSON.parse(res.text).queues.find((queue: any) => queue.name === queueName);
}

describe('Job data schema', () => {
  let serverAdapter: ExpressAdapter;
  let queue: Queue;

  beforeEach(() => {
    serverAdapter = new ExpressAdapter();
  });

  afterEach(async () => {
    await queue.obliterate({ force: true }).catch(() => {});
    await queue.close();
  });

  it('exposes the configured job data schema on the queue', async () => {
    const jobDataSchema = {
      type: 'object',
      properties: {
        make: { type: 'string' },
        model: { type: 'string' },
      },
      required: ['make', 'model'],
    };
    queue = new Queue('WithSchema', { connection });
    createBullBoard({ queues: [new BullMQAdapter(queue, { jobDataSchema })], serverAdapter });

    const serialized = await fetchQueue(serverAdapter, 'WithSchema');
    expect(serialized.jobDataSchema).toEqual(jobDataSchema);
  });

  it('omits the schema when the queue does not configure one', async () => {
    queue = new Queue('NoSchema', { connection });
    createBullBoard({ queues: [new BullMQAdapter(queue)], serverAdapter });

    const serialized = await fetchQueue(serverAdapter, 'NoSchema');
    expect(serialized.jobDataSchema).toBeUndefined();
  });
});
