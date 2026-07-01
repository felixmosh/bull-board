import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import request from 'supertest';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: +(process.env.REDIS_PORT || 6379),
};

// Regression test for https://github.com/felixmosh/bull-board/issues/1229
describe('queues with the same name but a different prefix', () => {
  let serverAdapter: ExpressAdapter;
  const queueList: Queue[] = [];

  beforeEach(() => {
    serverAdapter = new ExpressAdapter();
    queueList.length = 0;
  });

  afterEach(async () => {
    for (const queue of queueList) {
      await queue.close();
    }
  });

  it('keeps both queues as distinct board entries', async () => {
    const emailsTenantA = new Queue('emails', { connection, prefix: 'tenant-a' });
    const emailsTenantB = new Queue('emails', { connection, prefix: 'tenant-b' });
    queueList.push(emailsTenantA, emailsTenantB);

    createBullBoard({
      queues: [
        new BullMQAdapter(emailsTenantA, { prefix: 'tenant-a:' }),
        new BullMQAdapter(emailsTenantB, { prefix: 'tenant-b:' }),
      ],
      serverAdapter,
    });

    await request(serverAdapter.getRouter())
      .get('/api/queues')
      .expect('Content-Type', /json/)
      .expect(200)
      .then((res) => {
        const respQueues = JSON.parse(res.text).queues as Array<{ name: string }>;
        const names = respQueues.map((queue) => queue.name).sort();

        expect(names).toEqual(['tenant-a:emails', 'tenant-b:emails']);
      });
  });
});
