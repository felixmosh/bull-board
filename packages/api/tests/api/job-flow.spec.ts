import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
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

    const res = await agent
      .get(`/api/queues/${childQueue.name}/${childJobId}/flow`)
      .expect(200);

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

    const res = await agent
      .get(`/api/queues/${parentQueue.name}/${tree.job.id}/flow`)
      .expect(200);

    expect(res.body.isFlowNode).toBe(true);
    expect(res.body.flowRoot.id).toBe(tree.job.id);
    expect(res.body.flowRoot.children).toHaveLength(1);
    expect(res.body.flowRoot.children[0].name).toBe('leaf');
  });

  it('returns a non-flow response for a standalone job', async () => {
    const job = await parentQueue.add('solo', { foo: 'bar' });

    const agent = setupBoard();

    const res = await agent
      .get(`/api/queues/${parentQueue.name}/${job.id}/flow`)
      .expect(200);

    expect(res.body.nodeId).toBe(job.id);
    expect(res.body.isFlowNode).toBe(false);
    expect(res.body.flowRoot.id).toBe(job.id);
    expect(res.body.flowRoot.children).toHaveLength(0);
  });
});
