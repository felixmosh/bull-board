import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { FlowProducer, Queue } from 'bullmq';
import request from 'supertest';
import {
  assertResolvedMajor,
  connection,
  destroyQueue,
  EXPECTED_MAJOR,
  makeQueue,
} from './helpers';

describe(`Job flow on bullmq@${EXPECTED_MAJOR}`, () => {
  assertResolvedMajor();

  let parentQueue: Queue;
  let childQueue: Queue;
  let flowProducer: FlowProducer;

  beforeEach(async () => {
    parentQueue = await makeQueue('flow-parent');
    childQueue = await makeQueue('flow-child');
    flowProducer = new FlowProducer({ connection });
  });

  afterEach(async () => {
    await flowProducer.close();
    await destroyQueue(parentQueue);
    await destroyQueue(childQueue);
  });

  function setupBoard() {
    const serverAdapter = new ExpressAdapter();
    createBullBoard({
      queues: [new BullMQAdapter(parentQueue), new BullMQAdapter(childQueue)],
      serverAdapter,
    });
    return request(serverAdapter.getRouter());
  }

  async function addFlow() {
    return flowProducer.add({
      name: 'root',
      queueName: parentQueue.name,
      children: [
        { name: 'leaf-a', queueName: childQueue.name, data: { idx: 1 } },
        { name: 'leaf-b', queueName: childQueue.name, data: { idx: 2 } },
      ],
    });
  }

  it('resolves the full tree from a child job', async () => {
    const tree = await addFlow();
    const childJobId = tree.children![0].job.id;

    const res = await setupBoard()
      .get(`/api/queues/${childQueue.name}/${childJobId}/flow`)
      .expect(200);

    expect(res.body.isFlowNode).toBe(true);
    expect(res.body.flowRoot.id).toBe(tree.job.id);
    expect(res.body.flowRoot.children.map((c: any) => c.name).sort()).toEqual(['leaf-a', 'leaf-b']);
  });

  it('resolves the same tree from the root job', async () => {
    const tree = await addFlow();

    const res = await setupBoard()
      .get(`/api/queues/${parentQueue.name}/${tree.job.id}/flow`)
      .expect(200);

    expect(res.body.isFlowNode).toBe(true);
    expect(res.body.flowRoot.id).toBe(tree.job.id);
  });

  it('reports a standalone job as not being part of a flow', async () => {
    const job = await parentQueue.add('solo', {});

    const res = await setupBoard()
      .get(`/api/queues/${parentQueue.name}/${job.id}/flow`)
      .expect(200);

    expect(res.body.isFlowNode).toBe(false);
  });

  it('serves repeated requests from one cached producer', async () => {
    const tree = await addFlow();
    const agent = setupBoard();
    const path = `/api/queues/${parentQueue.name}/${tree.job.id}/flow`;

    // The producer is created lazily and cached on the adapter; both requests must be served
    // by the same instance without touching the raw client, which is what broke under v6.
    const [first, second] = await Promise.all([
      agent.get(path).expect(200),
      agent.get(path).expect(200),
    ]);

    expect(first.body.flowRoot.id).toBe(tree.job.id);
    expect(second.body.flowRoot.id).toBe(tree.job.id);
  });
});
