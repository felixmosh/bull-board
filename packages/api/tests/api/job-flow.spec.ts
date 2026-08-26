import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import Bull from 'bull';
import { FlowProducer, Queue } from 'bullmq';
import request from 'supertest';

describe('Job flow', () => {
  let serverAdapter: ExpressAdapter;
  let parentQueue: Queue;
  let childQueue: Queue;
  let flowProducer: FlowProducer;

  const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: +(process.env.REDIS_PORT || 6379),
  };

  beforeEach(async () => {
    serverAdapter = new ExpressAdapter();
    parentQueue = new Queue('FlowParent', { connection });
    childQueue = new Queue('FlowChild', { connection });
    flowProducer = new FlowProducer({ connection });
    await parentQueue.obliterate({ force: true }).catch(() => {});
    await childQueue.obliterate({ force: true }).catch(() => {});
  });

  afterEach(async () => {
    await parentQueue.obliterate({ force: true }).catch(() => {});
    await childQueue.obliterate({ force: true }).catch(() => {});
    await flowProducer.close();
    await parentQueue.close();
    await childQueue.close();
  });

  function setupBoard() {
    createBullBoard({
      queues: [new BullMQAdapter(parentQueue), new BullMQAdapter(childQueue)],
      serverAdapter,
    });
    return request(serverAdapter.getRouter());
  }

  it('resolves the full flow tree when querying a child job', async () => {
    const tree = await flowProducer.add({
      name: 'root',
      queueName: parentQueue.name,
      children: [
        { name: 'leaf-a', queueName: childQueue.name, data: { idx: 1 } },
        { name: 'leaf-b', queueName: childQueue.name, data: { idx: 2 } },
      ],
    });

    const agent = setupBoard();
    const childJobId = tree.children![0].job.id;

    const res = await agent.get(`/api/queues/${childQueue.name}/${childJobId}/flow`).expect(200);

    expect(res.body.nodeId).toBe(childJobId);
    expect(res.body.isFlowNode).toBe(true);
    expect(res.body.flowRoot.id).toBe(tree.job.id);
    expect(res.body.flowRoot.name).toBe('root');
    expect(res.body.flowRoot.queueName).toBe(parentQueue.name);
    const childNames = res.body.flowRoot.children.map((c: any) => c.name).sort();
    expect(childNames).toEqual(['leaf-a', 'leaf-b']);
  });

  it('resolves the same tree when querying the root job directly', async () => {
    const tree = await flowProducer.add({
      name: 'root',
      queueName: parentQueue.name,
      children: [{ name: 'leaf', queueName: childQueue.name, data: {} }],
    });

    const agent = setupBoard();

    const res = await agent.get(`/api/queues/${parentQueue.name}/${tree.job.id}/flow`).expect(200);

    expect(res.body.isFlowNode).toBe(true);
    expect(res.body.flowRoot.id).toBe(tree.job.id);
    expect(res.body.flowRoot.children).toHaveLength(1);
    expect(res.body.flowRoot.children[0].name).toBe('leaf');
  });

  it('resolves the flow tree when queues use a custom prefix', async () => {
    const customPrefix = 'custom-prefix';
    // Every connection opened in beforeEach has to be closed before its variable is
    // reassigned, or afterEach only ever closes the replacement. The queues were
    // already handled; the FlowProducer was not, so its Redis connection outlived
    // the run and kept the worker process alive.
    await parentQueue.close();
    await childQueue.close();
    await flowProducer.close();

    parentQueue = new Queue('FlowParent', { connection, prefix: customPrefix });
    childQueue = new Queue('FlowChild', { connection, prefix: customPrefix });
    await parentQueue.obliterate({ force: true }).catch(() => {});
    await childQueue.obliterate({ force: true }).catch(() => {});

    flowProducer = new FlowProducer({ connection, prefix: customPrefix });

    const tree = await flowProducer.add({
      name: 'root',
      queueName: parentQueue.name,
      children: [{ name: 'leaf', queueName: childQueue.name, data: {} }],
    });

    createBullBoard({
      queues: [new BullMQAdapter(parentQueue), new BullMQAdapter(childQueue)],
      serverAdapter,
    });
    const agent = request(serverAdapter.getRouter());

    const res = await agent
      .get(`/api/queues/${childQueue.name}/${tree.children![0].job.id}/flow`)
      .expect(200);

    expect(res.body.isFlowNode).toBe(true);
    expect(res.body.flowRoot.id).toBe(tree.job.id);
    expect(res.body.flowRoot.children).toHaveLength(1);
    expect(res.body.flowRoot.children[0].name).toBe('leaf');
  });

  it('returns a non-flow response for a standalone job', async () => {
    const job = await parentQueue.add('solo', { foo: 'bar' });

    const agent = setupBoard();

    const res = await agent.get(`/api/queues/${parentQueue.name}/${job.id}/flow`).expect(200);

    expect(res.body.nodeId).toBe(job.id);
    expect(res.body.isFlowNode).toBe(false);
    expect(res.body.flowRoot.id).toBe(job.id);
    expect(res.body.flowRoot.children).toHaveLength(0);
  });

  it('returns a non-flow response when the parent queue is not on the board', async () => {
    const tree = await flowProducer.add({
      name: 'root',
      queueName: parentQueue.name,
      children: [{ name: 'leaf', queueName: childQueue.name, data: {} }],
    });
    const childJobId = tree.children![0].job.id;

    createBullBoard({ queues: [new BullMQAdapter(childQueue)], serverAdapter });
    const agent = request(serverAdapter.getRouter());

    const res = await agent.get(`/api/queues/${childQueue.name}/${childJobId}/flow`).expect(200);

    expect(res.body).toEqual({ nodeId: childJobId, flowRoot: null, isFlowNode: false });
  });

  it('returns a non-flow response for a Bull queue, which has no flows', async () => {
    const bullQueue = new Bull('FlowBull', { redis: connection });
    bullQueue.on('error', () => {});

    try {
      const job = await bullQueue.add('solo', {});
      createBullBoard({ queues: [new BullAdapter(bullQueue)], serverAdapter });

      const res = await request(serverAdapter.getRouter())
        .get(`/api/queues/FlowBull/${job.id}/flow`)
        .expect(200);

      expect(res.body).toEqual({ nodeId: String(job.id), flowRoot: null, isFlowNode: false });
    } finally {
      await bullQueue.obliterate({ force: true }).catch(() => {});
      await bullQueue.close();
    }
  });
});
