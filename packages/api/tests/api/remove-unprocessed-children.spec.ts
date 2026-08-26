import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import Bull from 'bull';
import { FlowProducer, Queue } from 'bullmq';
import request from 'supertest';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: +(process.env.REDIS_PORT || 6379),
};

describe('remove unprocessed children', () => {
  let parentQueue: Queue;
  let childQueue: Queue;
  let flowProducer: FlowProducer;
  let serverAdapter: ExpressAdapter;

  beforeEach(async () => {
    parentQueue = new Queue('UnprocessedParent', { connection });
    childQueue = new Queue('UnprocessedChild', { connection });
    flowProducer = new FlowProducer({ connection });
    await parentQueue.obliterate({ force: true }).catch(() => {});
    await childQueue.obliterate({ force: true }).catch(() => {});
    serverAdapter = new ExpressAdapter();
    createBullBoard({
      queues: [new BullMQAdapter(parentQueue), new BullMQAdapter(childQueue)],
      serverAdapter,
    });
  });

  afterEach(async () => {
    await parentQueue.obliterate({ force: true }).catch(() => {});
    await childQueue.obliterate({ force: true }).catch(() => {});
    await flowProducer.close();
    await parentQueue.close();
    await childQueue.close();
  });

  async function seedFlow(children: number) {
    return flowProducer.add({
      name: 'root',
      queueName: parentQueue.name,
      children: Array.from({ length: children }, (_, i) => ({
        name: `leaf-${i}`,
        queueName: childQueue.name,
        data: {},
      })),
    });
  }

  it('clears the children a parent is still waiting on and reports how many', async () => {
    const tree = await seedFlow(3);
    const agent = request(serverAdapter.getRouter());

    const res = await agent
      .put(`/api/queues/UnprocessedParent/${tree.job.id}/remove-unprocessed-children`)
      .expect(200);

    expect(JSON.parse(res.text)).toEqual({ removed: 3 });

    const parent = await parentQueue.getJob(tree.job.id!);
    const counts = await parent!.getDependenciesCount({ unprocessed: true });
    expect(counts.unprocessed ?? 0).toBe(0);
  });

  it('leaves the parent itself in place', async () => {
    const tree = await seedFlow(2);

    await request(serverAdapter.getRouter())
      .put(`/api/queues/UnprocessedParent/${tree.job.id}/remove-unprocessed-children`)
      .expect(200);

    expect(await parentQueue.getJob(tree.job.id!)).toBeDefined();
  });

  it('refuses a job with nothing unprocessed rather than reporting a no-op as success', async () => {
    const job = await parentQueue.add('lonely', {});

    const res = await request(serverAdapter.getRouter())
      .put(`/api/queues/UnprocessedParent/${job.id}/remove-unprocessed-children`)
      .expect(400);

    expect(JSON.parse(res.text).error).toEqual({
      key: 'ERRORS.JOB_HAS_NO_UNPROCESSED_CHILDREN',
    });
  });

  it('answers 404 for a job that is gone', async () => {
    const res = await request(serverAdapter.getRouter())
      .put('/api/queues/UnprocessedParent/nope/remove-unprocessed-children')
      .expect(404);

    expect(JSON.parse(res.text).error).toEqual({ key: 'ERRORS.JOB_NOT_FOUND' });
  });

  it('tells a Bull caller it is unsupported', async () => {
    const bullQueue = new Bull('UnprocessedBullQueue', { redis: connection });
    const bullServerAdapter = new ExpressAdapter();
    createBullBoard({ queues: [new BullAdapter(bullQueue)], serverAdapter: bullServerAdapter });

    const job = await bullQueue.add({});

    const res = await request(bullServerAdapter.getRouter())
      .put(`/api/queues/UnprocessedBullQueue/${job.id}/remove-unprocessed-children`)
      .expect(400);

    expect(JSON.parse(res.text).error).toEqual({
      key: 'ERRORS.JOB_UNPROCESSED_CHILDREN_NOT_SUPPORTED',
    });

    await bullQueue.obliterate({ force: true }).catch(() => {});
    await bullQueue.close();
  });
});
