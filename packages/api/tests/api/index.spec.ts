import { Queue } from 'bullmq';
import request from 'supertest';

import { createBullBoard } from '@wirdo-bullboard/api';
import { BullMQAdapter } from '@wirdo-bullboard/api/bullMQAdapter';
import { ExpressAdapter } from '@wirdo-bullboard/express';

describe('happy', () => {
  let serverAdapter: ExpressAdapter;
  const queueList: Queue[] = [];
  const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: +(process.env.REDIS_PORT || 6379),
  };

  beforeEach(() => {
    serverAdapter = new ExpressAdapter();
    queueList.length = 0;
  });

  afterEach(async () => {
    for (const queue of queueList) {
      await queue.close();
    }
  });

  it('should be able to set queue', async () => {
    const paintQueue = new Queue('Paint', { connection });
    queueList.push(paintQueue);

    createBullBoard({ queues: [new BullMQAdapter(paintQueue)], serverAdapter });

    await request(serverAdapter.getRouter())
      .get('/api/queues')
      .expect('Content-Type', /json/)
      .expect(200)
      .then((res) => {
        const queues = JSON.parse(res.text).queues;
        expect(queues).toHaveLength(1);
        expect(queues[0].name).toBe(paintQueue.name);
      });
  });

  it('should be able to replace queues', async () => {
    const paintQueue = new Queue('Paint', { connection });

    const drainQueue = new Queue('Drain', { connection });

    const codeQueue = new Queue('Code', { connection });
    queueList.push(paintQueue, drainQueue, codeQueue);

    const queues = [new BullMQAdapter(paintQueue), new BullMQAdapter(drainQueue)];
    const { replaceQueues } = createBullBoard({
      queues,
      serverAdapter,
    });

    await request(serverAdapter.getRouter())
      .get('/api/queues')
      .expect('Content-Type', /json/)
      .expect(200)
      .then((res) => {
        const respQueues = JSON.parse(res.text).queues;
        expect(respQueues).toHaveLength(queues.length);

        queues.forEach((queue, index) => {
          expect(respQueues[index].name).toBe(queue.getName());
        });
      });

    const newQueues = [new BullMQAdapter(codeQueue)];
    replaceQueues(newQueues);

    await request(serverAdapter.getRouter())
      .get('/api/queues')
      .expect('Content-Type', /json/)
      .expect(200)
      .then((res) => {
        const respQueues = JSON.parse(res.text).queues;
        expect(respQueues).toHaveLength(newQueues.length);

        newQueues.forEach((queue, index) => {
          expect(respQueues[index].name).toBe(queue.getName());
        });
      });
  });

  it('should be able to add a queue', async () => {
    const addedQueue = new Queue('AddedQueue', { connection });
    queueList.push(addedQueue);
    const { addQueue } = createBullBoard({ queues: [], serverAdapter });

    await request(serverAdapter.getRouter())
      .get('/api/queues')
      .expect('Content-Type', /json/)
      .expect(200)
      .then((res) => {
        const respQueues = JSON.parse(res.text).queues;
        expect(respQueues).toHaveLength(0);
      });

    addQueue(new BullMQAdapter(addedQueue));

    await request(serverAdapter.getRouter())
      .get('/api/queues')
      .expect('Content-Type', /json/)
      .expect(200)
      .then((res) => {
        const respQueues = JSON.parse(res.text).queues;
        expect(respQueues).toHaveLength(1);

        expect(respQueues[0].name).toBe(addedQueue.name);
      });
  });

  it('should be able to remove a queue when passed as queue object', async () => {
    const addedQueue = new Queue('AddedQueue', { connection });
    queueList.push(addedQueue);
    const { addQueue, removeQueue } = createBullBoard({ queues: [], serverAdapter });

    addQueue(new BullMQAdapter(addedQueue));
    await request(serverAdapter.getRouter())
      .get('/api/queues')
      .expect('Content-Type', /json/)
      .expect(200)
      .then((res) => {
        const respQueues = JSON.parse(res.text).queues;
        expect(respQueues).toHaveLength(1);

        expect(respQueues[0].name).toBe(addedQueue.name);
      });

    removeQueue(new BullMQAdapter(addedQueue));

    await request(serverAdapter.getRouter())
      .get('/api/queues')
      .expect('Content-Type', /json/)
      .expect(200)
      .then((res) => {
        const respQueues = JSON.parse(res.text).queues;
        expect(respQueues).toHaveLength(0);
      });
  });

  it('should be able to remove a queue when passed as string', async () => {
    const addedQueue = new Queue('AddedQueue', { connection });
    queueList.push(addedQueue);

    const { addQueue, removeQueue } = createBullBoard({ queues: [], serverAdapter });

    addQueue(new BullMQAdapter(addedQueue));
    await request(serverAdapter.getRouter())
      .get('/api/queues')
      .expect('Content-Type', /json/)
      .expect(200)
      .then((res) => {
        const respQueues = JSON.parse(res.text).queues;
        expect(respQueues).toHaveLength(1);

        expect(respQueues[0].name).toBe(addedQueue.name);
      });

    removeQueue('AddedQueue');

    await request(serverAdapter.getRouter())
      .get('/api/queues')
      .expect('Content-Type', /json/)
      .expect(200)
      .then((res) => {
        const respQueues = JSON.parse(res.text).queues;
        expect(respQueues).toHaveLength(0);
      });
  });

  it('should be able to replace queues without initial set', async () => {
    const codeQueue = new Queue('Code', { connection });
    queueList.push(codeQueue);
    const { replaceQueues } = createBullBoard({ queues: [], serverAdapter });

    replaceQueues([new BullMQAdapter(codeQueue)]);

    await request(serverAdapter.getRouter())
      .get('/api/queues')
      .expect('Content-Type', /json/)
      .expect(200)
      .then((res) => {
        const respQueues = JSON.parse(res.text).queues;
        expect(respQueues).toHaveLength(1);

        expect(respQueues[0].name).toBe(codeQueue.name);
      });
  });

  describe('Queue options', () => {
    it('should disable retries in queue', async () => {
      const paintQueue = new Queue('Paint', { connection });
      queueList.push(paintQueue);

      createBullBoard({
        queues: [new BullMQAdapter(paintQueue, { allowRetries: false })],
        serverAdapter,
      });

      await request(serverAdapter.getRouter())
        .get('/api/queues')
        .expect('Content-Type', /json/)
        .expect(200)
        .then((res) => {
          const respQueues = JSON.parse(res.text).queues;
          expect(respQueues).toHaveLength(1);

          expect(respQueues[0].allowRetries).toBeFalsy();
        });
    });

    it('should disable retries in queue if readOnlyMode is true', async () => {
      const paintQueue = new Queue('Paint', { connection });
      queueList.push(paintQueue);

      createBullBoard({
        queues: [new BullMQAdapter(paintQueue, { allowRetries: true, readOnlyMode: true })],
        serverAdapter,
      });

      await request(serverAdapter.getRouter())
        .get('/api/queues')
        .expect('Content-Type', /json/)
        .expect(200)
        .then((res) => {
          const respQueues = JSON.parse(res.text).queues;
          expect(respQueues).toHaveLength(1);

          expect(respQueues[0].allowRetries).toBeFalsy();
          expect(respQueues[0].readOnlyMode).toBeTruthy();
        });
    });

    it('should get redis stats', async () => {
      const paintQueue = new Queue('Paint', { connection });
      queueList.push(paintQueue);

      createBullBoard({
        queues: [new BullMQAdapter(paintQueue)],
        serverAdapter,
      });

      await request(serverAdapter.getRouter())
        .get('/api/redis/stats')
        .expect('Content-Type', /json/)
        .expect(200)
        .then((res) => {
          const responseJson = JSON.parse(res.text);

          expect(responseJson).toHaveProperty('version', expect.stringMatching(/\d+\.\d+\.\d+/));
        });
    });
  });
});
