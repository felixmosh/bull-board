import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import request from 'supertest';

describe('Job/queue handlers', () => {
  let serverAdapter: ExpressAdapter;
  let queue: Queue;

  const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: +(process.env.REDIS_PORT || 6379),
  };

  beforeEach(async () => {
    serverAdapter = new ExpressAdapter();
    queue = new Queue('HandlersTest', { connection });
    await queue.obliterate({ force: true }).catch(() => {});
  });

  afterEach(async () => {
    await queue.obliterate({ force: true }).catch(() => {});
    await queue.close();
  });

  function setupBoard() {
    createBullBoard({ queues: [new BullMQAdapter(queue)], serverAdapter });
    return request(serverAdapter.getRouter());
  }

  it('promotes all delayed jobs', async () => {
    await queue.add('a', {}, { delay: 60_000 });
    await queue.add('b', {}, { delay: 60_000 });
    expect(await queue.getDelayedCount()).toBe(2);
    const agent = setupBoard();

    await agent.put('/api/queues/HandlersTest/promote').expect(200);

    expect(await queue.getDelayedCount()).toBe(0);
  });

  it('promotes a single delayed job', async () => {
    const job = await queue.add('solo', {}, { delay: 60_000 });
    const agent = setupBoard();

    await agent.put(`/api/queues/HandlersTest/${job.id}/promote`).expect(204);

    expect(await queue.getDelayedCount()).toBe(0);
  });

  it('cleans a given status, retaining jobs within the grace window', async () => {
    await queue.add('d', {}, { delay: 60_000 });
    expect(await queue.getDelayedCount()).toBe(1);
    const agent = setupBoard();

    // The handler's 5s grace retains this just-added job.
    await agent.put('/api/queues/HandlersTest/clean/delayed').expect(200);

    expect(await queue.getDelayedCount()).toBe(1);
  });

  it('updates a job\'s data', async () => {
    const job = await queue.add('editable', { value: 'before' });
    const agent = setupBoard();

    await agent
      .patch(`/api/queues/HandlersTest/${job.id}/update-data`)
      .send({ jobData: { value: 'after' } })
      .expect(200);

    const updated = await queue.getJob(job.id as string);
    expect(updated?.data).toEqual({ value: 'after' });
  });

  it('returns a job\'s logs', async () => {
    const job = await queue.add('logged', {});
    await queue.addJobLog(job.id as string, 'first line');
    const agent = setupBoard();

    const res = await agent
      .get(`/api/queues/HandlersTest/${job.id}/logs`)
      .expect(200);

    expect(res.body).toEqual(['first line']);
  });
});
