import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { FlowProducer, Queue, UnrecoverableError, Worker } from 'bullmq';
import request from 'supertest';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: +(process.env.REDIS_PORT || 6379),
};

describe('Job flow dependencies', () => {
  let serverAdapter: ExpressAdapter;
  let parentQueue: Queue;
  let childQueue: Queue;
  let flowProducer: FlowProducer;
  let worker: Worker | undefined;

  beforeEach(async () => {
    serverAdapter = new ExpressAdapter();
    parentQueue = new Queue('DepsParent', { connection });
    childQueue = new Queue('DepsChild', { connection });
    flowProducer = new FlowProducer({ connection });
    await parentQueue.obliterate({ force: true }).catch(() => {});
    await childQueue.obliterate({ force: true }).catch(() => {});
  });

  afterEach(async () => {
    await worker?.close();
    worker = undefined;
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

  it('counts the children a parent is still waiting on', async () => {
    const tree = await flowProducer.add({
      name: 'root',
      queueName: parentQueue.name,
      children: [
        { name: 'leaf-a', queueName: childQueue.name, data: {} },
        { name: 'leaf-b', queueName: childQueue.name, data: {} },
      ],
    });

    const res = await setupBoard()
      .get(`/api/queues/${parentQueue.name}/${tree.job.id}/flow`)
      .expect(200);

    expect(res.body.flowRoot.dependencies).toEqual({
      processed: 0,
      unprocessed: 2,
      ignored: 0,
      failed: 0,
    });
  });

  it('reports an ignored child and the reason it was ignored', async () => {
    const tree = await flowProducer.add({
      name: 'root',
      queueName: parentQueue.name,
      children: [
        {
          name: 'doomed',
          queueName: childQueue.name,
          data: {},
          opts: { ignoreDependencyOnFailure: true },
        },
      ],
    });

    worker = new Worker(
      childQueue.name,
      async (): Promise<void> => {
        throw new UnrecoverableError('downstream refused the request');
      },
      { connection }
    );

    await new Promise<void>((resolve) => worker!.on('failed', () => resolve()));

    const res = await setupBoard()
      .get(`/api/queues/${parentQueue.name}/${tree.job.id}/flow`)
      .expect(200);

    expect(res.body.flowRoot.dependencies).toMatchObject({ ignored: 1, unprocessed: 0 });
    expect(Object.values(res.body.flowRoot.ignoredChildFailureReasons)).toEqual([
      'downstream refused the request',
    ]);
  });

  it('omits both fields on a node with no children at all', async () => {
    const tree = await flowProducer.add({
      name: 'root',
      queueName: parentQueue.name,
      children: [{ name: 'leaf', queueName: childQueue.name, data: {} }],
    });

    const res = await setupBoard()
      .get(`/api/queues/${parentQueue.name}/${tree.job.id}/flow`)
      .expect(200);

    const [leaf] = res.body.flowRoot.children;
    expect(leaf).not.toHaveProperty('dependencies');
    expect(leaf).not.toHaveProperty('ignoredChildFailureReasons');
  });
});
