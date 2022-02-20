import { Queue } from 'bullmq';
import request from 'supertest';

import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

describe('happy', () => {
  let serverAdapter: ExpressAdapter;

  beforeEach(() => {
    serverAdapter = new ExpressAdapter();
  });

  it('should be able to set queue', async () => {
    const paintQueue = new Queue('Paint', {
      connection: {
        host: 'localhost',
        port: 6379,
      },
    });

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
    const paintQueue = new Queue('Paint', {
      connection: {
        host: 'localhost',
        port: 6379,
      },
    });

    const drainQueue = new Queue('Drain', {
      connection: {
        host: 'localhost',
        port: 6379,
      },
    });

    const codeQueue = new Queue('Code', {
      connection: {
        host: 'localhost',
        port: 6379,
      },
    });
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
    const addedQueue = new Queue('AddedQueue', {
      connection: {
        host: 'localhost',
        port: 6379,
      },
    });

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
    const addedQueue = new Queue('AddedQueue', {
      connection: {
        host: 'localhost',
        port: 6379,
      },
    });

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
    const addedQueue = new Queue('AddedQueue', {
      connection: {
        host: 'localhost',
        port: 6379,
      },
    });

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
    const codeQueue = new Queue('Code', {
      connection: {
        host: 'localhost',
        port: 6379,
      },
    });

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
      const paintQueue = new Queue('Paint', {
        connection: {
          host: 'localhost',
          port: 6379,
        },
      });

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
      const paintQueue = new Queue('Paint', {
        connection: {
          host: 'localhost',
          port: 6379,
        },
      });

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
  });
});
