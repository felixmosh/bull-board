import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import Bull from 'bull';
import { FlowProducer, Queue } from 'bullmq';
import IORedis from 'ioredis';
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

  // These specs run under several jest projects against one Redis, and the floor project
  // replays them, so fixed queue names let concurrent runs obliterate each other's jobs.
  let run = 0;
  const parentName = () => `FlowParent-${process.env.JEST_WORKER_ID}-${run}`;
  const childName = () => `FlowChild-${process.env.JEST_WORKER_ID}-${run}`;

  beforeEach(async () => {
    run += 1;
    serverAdapter = new ExpressAdapter();
    parentQueue = new Queue(parentName(), { connection });
    childQueue = new Queue(childName(), { connection });
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

    parentQueue = new Queue(parentName(), { connection, prefix: customPrefix });
    childQueue = new Queue(childName(), { connection, prefix: customPrefix });
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

  async function addChain() {
    return flowProducer.add({
      name: 'root',
      queueName: parentQueue.name,
      children: [
        {
          name: 'middle',
          queueName: childQueue.name,
          data: {},
          children: [{ name: 'leaf', queueName: childQueue.name, data: {} }],
        },
      ],
    });
  }

  it('stops at the requested depth', async () => {
    const tree = await addChain();
    const agent = setupBoard();

    const res = await agent
      .get(`/api/queues/${parentQueue.name}/${tree.job.id}/flow?depth=2`)
      .expect(200);

    expect(res.body.flowRoot.children).toHaveLength(1);
    expect(res.body.flowRoot.children[0].name).toBe('middle');
    expect(res.body.flowRoot.children[0].children).toHaveLength(0);
  });

  it('returns the root alone at depth 1', async () => {
    const tree = await addChain();
    const agent = setupBoard();

    const res = await agent
      .get(`/api/queues/${parentQueue.name}/${tree.job.id}/flow?depth=1`)
      .expect(200);

    expect(res.body.flowRoot.id).toBe(tree.job.id);
    expect(res.body.flowRoot.children).toHaveLength(0);
  });

  it('caps the children per node at maxChildren', async () => {
    const tree = await flowProducer.add({
      name: 'root',
      queueName: parentQueue.name,
      children: Array.from({ length: 6 }, (_, idx) => ({
        name: `leaf-${idx}`,
        queueName: childQueue.name,
        data: { idx },
      })),
    });
    const agent = setupBoard();

    const res = await agent
      .get(`/api/queues/${parentQueue.name}/${tree.job.id}/flow?maxChildren=2`)
      .expect(200);

    expect(res.body.flowRoot.children).toHaveLength(2);
  });

  it('clamps an out of range depth to the nearest bound', async () => {
    const tree = await addChain();
    const agent = setupBoard();

    const tooLarge = await agent
      .get(`/api/queues/${parentQueue.name}/${tree.job.id}/flow?depth=999`)
      .expect(200);
    expect(tooLarge.body.flowRoot.children[0].children).toHaveLength(1);

    const tooSmall = await agent
      .get(`/api/queues/${parentQueue.name}/${tree.job.id}/flow?depth=0`)
      .expect(200);
    expect(tooSmall.body.flowRoot.children).toHaveLength(0);
  });

  it('falls back to the default window for unparseable parameters', async () => {
    const tree = await addChain();
    const agent = setupBoard();

    const res = await agent
      .get(`/api/queues/${parentQueue.name}/${tree.job.id}/flow?depth=abc&maxChildren=`)
      .expect(200);

    expect(res.body.flowRoot.children[0].children).toHaveLength(1);
    expect(res.body.flowRoot.children[0].children[0].name).toBe('leaf');
  });

  it('marks a node whose children were capped as truncated', async () => {
    const tree = await flowProducer.add({
      name: 'root',
      queueName: parentQueue.name,
      children: Array.from({ length: 6 }, (_, idx) => ({
        name: `leaf-${idx}`,
        queueName: childQueue.name,
        data: { idx },
      })),
    });
    const agent = setupBoard();

    const res = await agent
      .get(`/api/queues/${parentQueue.name}/${tree.job.id}/flow?maxChildren=2`)
      .expect(200);

    expect(res.body.flowRoot.truncated).toBe(true);
    expect(res.body.flowRoot.children).toHaveLength(2);
    expect(res.body.flowRoot.dependencies.unprocessed).toBe(6);
  });

  it('marks a node cut off by the depth limit as truncated', async () => {
    const tree = await addChain();
    const agent = setupBoard();

    const res = await agent
      .get(`/api/queues/${parentQueue.name}/${tree.job.id}/flow?depth=2`)
      .expect(200);

    expect(res.body.flowRoot.truncated).toBeUndefined();
    expect(res.body.flowRoot.children[0].truncated).toBe(true);
  });

  it('does not mark a fully returned node as truncated', async () => {
    const tree = await addChain();
    const agent = setupBoard();

    const res = await agent.get(`/api/queues/${parentQueue.name}/${tree.job.id}/flow`).expect(200);

    expect(res.body.flowRoot.truncated).toBeUndefined();
    expect(res.body.flowRoot.children[0].truncated).toBeUndefined();
    expect(res.body.flowRoot.children[0].children[0].truncated).toBeUndefined();
  });

  it('stops after the node budget and marks the parent truncated', async () => {
    const tree = await flowProducer.add({
      name: 'root',
      queueName: parentQueue.name,
      children: Array.from({ length: 250 }, (_, idx) => ({
        name: `leaf-${idx}`,
        queueName: childQueue.name,
        data: { idx },
      })),
    });
    const agent = setupBoard();

    const res = await agent
      .get(`/api/queues/${parentQueue.name}/${tree.job.id}/flow?maxChildren=200`)
      .expect(200);

    // `maxChildren` reaches Redis as the COUNT hint on SSCAN, which is not a hard limit, so
    // this asserts the cap rather than an exact width.
    expect(res.body.flowRoot.children.length).toBeLessThanOrEqual(200);
    expect(res.body.flowRoot.children.length).toBeGreaterThan(0);
    expect(res.body.flowRoot.truncated).toBe(true);
    expect(res.body.flowRoot.dependencies.unprocessed).toBe(250);
  });

  it('fills shallow levels before deep ones when the budget runs out', async () => {
    const tree = await flowProducer.add({
      name: 'root',
      queueName: parentQueue.name,
      children: [
        {
          name: 'branch',
          queueName: childQueue.name,
          data: {},
          children: Array.from({ length: 150 }, (_, idx) => ({
            name: `wide-${idx}`,
            queueName: childQueue.name,
            data: {},
          })),
        },
        ...Array.from({ length: 100 }, (_, idx) => ({
          name: `shallow-${idx}`,
          queueName: childQueue.name,
          data: {},
        })),
      ],
    });
    const agent = setupBoard();

    const res = await agent
      .get(`/api/queues/${parentQueue.name}/${tree.job.id}/flow?maxChildren=200`)
      .expect(200);

    expect(res.body.flowRoot.children).toHaveLength(101);
    const branch = res.body.flowRoot.children.find((c: any) => c.name === 'branch');
    expect(branch.truncated).toBe(true);
    expect(branch.children.length).toBeLessThan(150);
  });

  // A child removed by `removeOnComplete` leaves its key in the parent's dependency set, and
  // BullMQ's getFlow yields `undefined` in `children` for it.
  it('skips children whose job data is already gone', async () => {
    const tree = await flowProducer.add({
      name: 'root',
      queueName: parentQueue.name,
      children: [
        { name: 'leaf-a', queueName: childQueue.name, data: {} },
        { name: 'leaf-b', queueName: childQueue.name, data: {} },
      ],
    });

    const client = new IORedis(connection);
    try {
      await client.del(`bull:${childQueue.name}:${tree.children![0].job.id}`);
    } finally {
      await client.quit();
    }

    const agent = setupBoard();

    const res = await agent.get(`/api/queues/${parentQueue.name}/${tree.job.id}/flow`).expect(200);

    expect(res.body.flowRoot.id).toBe(tree.job.id);
    expect(res.body.flowRoot.children).toHaveLength(1);
    expect(res.body.flowRoot.children[0].name).toBe('leaf-b');
    expect(res.body.flowRoot.truncated).toBeUndefined();
  });

  it('loads a whole level of children when only one level was asked for', async () => {
    const tree = await flowProducer.add({
      name: 'root',
      queueName: parentQueue.name,
      children: Array.from({ length: 250 }, (_, idx) => ({
        name: `leaf-${idx}`,
        queueName: childQueue.name,
        data: { idx },
      })),
    });
    const agent = setupBoard();

    const res = await agent
      .get(`/api/queues/${parentQueue.name}/${tree.job.id}/flow?root=node&depth=2&maxChildren=1000`)
      .expect(200);

    expect(res.body.flowRoot.children).toHaveLength(250);
    expect(res.body.flowRoot.truncated).toBeUndefined();
  });

  it('still holds the flat budget when the window goes deeper than one level', async () => {
    const tree = await flowProducer.add({
      name: 'root',
      queueName: parentQueue.name,
      children: Array.from({ length: 250 }, (_, idx) => ({
        name: `leaf-${idx}`,
        queueName: childQueue.name,
        data: { idx },
      })),
    });
    const agent = setupBoard();

    const res = await agent
      .get(`/api/queues/${parentQueue.name}/${tree.job.id}/flow?depth=3&maxChildren=1000`)
      .expect(200);

    expect(res.body.flowRoot.children).toHaveLength(200);
    expect(res.body.flowRoot.truncated).toBe(true);
  });

  it('roots the tree at the requested job when root=node', async () => {
    const tree = await addChain();
    const middleJobId = tree.children![0].job.id;
    const agent = setupBoard();

    const res = await agent
      .get(`/api/queues/${childQueue.name}/${middleJobId}/flow?root=node`)
      .expect(200);

    expect(res.body.nodeId).toBe(middleJobId);
    expect(res.body.flowRoot.id).toBe(middleJobId);
    expect(res.body.flowRoot.name).toBe('middle');
    expect(res.body.flowRoot.children).toHaveLength(1);
    expect(res.body.flowRoot.children[0].name).toBe('leaf');
  });

  it('walks up to the flow root when root is absent or unrecognised', async () => {
    const tree = await addChain();
    const middleJobId = tree.children![0].job.id;
    const agent = setupBoard();

    const res = await agent
      .get(`/api/queues/${childQueue.name}/${middleJobId}/flow?root=sideways`)
      .expect(200);

    expect(res.body.flowRoot.id).toBe(tree.job.id);
    expect(res.body.flowRoot.name).toBe('root');
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
