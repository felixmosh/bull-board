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
        expect(JSON.parse(res.text)).toMatchInlineSnapshot(
          {
            stats: {
              blocked_clients: expect.any(String),
              connected_clients: expect.any(String),
              mem_fragmentation_ratio: expect.any(String),
              redis_version: expect.any(String),
              total_system_memory: expect.any(String),
              used_memory: expect.any(String),
            },
          },
          `
          Object {
            "queues": Array [
              Object {
                "counts": Object {
                  "active": 0,
                  "completed": 0,
                  "delayed": 0,
                  "failed": 0,
                  "paused": 0,
                  "waiting": 0,
                  "waiting-children": 0,
                },
                "isPaused": false,
                "jobs": Array [],
                "name": "Paint",
                "pagination": Object {
                  "pageCount": 1,
                  "range": Object {
                    "end": 9,
                    "start": 0,
                  },
                },
                "readOnlyMode": false,
              },
            ],
            "stats": Object {
              "blocked_clients": Any<String>,
              "connected_clients": Any<String>,
              "mem_fragmentation_ratio": Any<String>,
              "redis_version": Any<String>,
              "total_system_memory": Any<String>,
              "used_memory": Any<String>,
            },
          }
        `
        );
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

    const { replaceQueues } = createBullBoard({
      queues: [new BullMQAdapter(paintQueue), new BullMQAdapter(drainQueue)],
      serverAdapter,
    });

    replaceQueues([new BullMQAdapter(codeQueue)]);

    await request(serverAdapter.getRouter())
      .get('/api/queues')
      .expect('Content-Type', /json/)
      .expect(200)
      .then((res) => {
        expect(JSON.parse(res.text)).toMatchInlineSnapshot(
          {
            stats: {
              blocked_clients: expect.any(String),
              connected_clients: expect.any(String),
              mem_fragmentation_ratio: expect.any(String),
              redis_version: expect.any(String),
              total_system_memory: expect.any(String),
              used_memory: expect.any(String),
            },
          },
          `
          Object {
            "queues": Array [
              Object {
                "counts": Object {
                  "active": 0,
                  "completed": 0,
                  "delayed": 0,
                  "failed": 0,
                  "paused": 0,
                  "waiting": 0,
                  "waiting-children": 0,
                },
                "isPaused": false,
                "jobs": Array [],
                "name": "Code",
                "pagination": Object {
                  "pageCount": 1,
                  "range": Object {
                    "end": 9,
                    "start": 0,
                  },
                },
                "readOnlyMode": false,
              },
            ],
            "stats": Object {
              "blocked_clients": Any<String>,
              "connected_clients": Any<String>,
              "mem_fragmentation_ratio": Any<String>,
              "redis_version": Any<String>,
              "total_system_memory": Any<String>,
              "used_memory": Any<String>,
            },
          }
        `
        );
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

    addQueue(new BullMQAdapter(addedQueue));

    await request(serverAdapter.getRouter())
      .get('/api/queues')
      .expect('Content-Type', /json/)
      .expect(200)
      .then((res) => {
        expect(JSON.parse(res.text)).toMatchInlineSnapshot(
          {
            stats: {
              blocked_clients: expect.any(String),
              connected_clients: expect.any(String),
              mem_fragmentation_ratio: expect.any(String),
              redis_version: expect.any(String),
              total_system_memory: expect.any(String),
              used_memory: expect.any(String),
            },
          },
          `
          Object {
            "queues": Array [
              Object {
                "counts": Object {
                  "active": 0,
                  "completed": 0,
                  "delayed": 0,
                  "failed": 0,
                  "paused": 0,
                  "waiting": 0,
                  "waiting-children": 0,
                },
                "isPaused": false,
                "jobs": Array [],
                "name": "AddedQueue",
                "pagination": Object {
                  "pageCount": 1,
                  "range": Object {
                    "end": 9,
                    "start": 0,
                  },
                },
                "readOnlyMode": false,
              },
            ],
            "stats": Object {
              "blocked_clients": Any<String>,
              "connected_clients": Any<String>,
              "mem_fragmentation_ratio": Any<String>,
              "redis_version": Any<String>,
              "total_system_memory": Any<String>,
              "used_memory": Any<String>,
            },
          }
        `
        );
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
    removeQueue(new BullMQAdapter(addedQueue));

    await request(serverAdapter.getRouter())
      .get('/api/queues')
      .expect('Content-Type', /json/)
      .expect(200)
      .then((res) => {
        expect(JSON.parse(res.text)).toMatchInlineSnapshot(
          {
            queues: [],
            stats: {},
          },
          `
          Object {
            "queues": Array [],
            "stats": Object {},
          }
        `
        );
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
    removeQueue('AddedQueue');

    await request(serverAdapter.getRouter())
      .get('/api/queues')
      .expect('Content-Type', /json/)
      .expect(200)
      .then((res) => {
        expect(JSON.parse(res.text)).toMatchInlineSnapshot(
          {
            queues: [],
            stats: {},
          },
          `
          Object {
            "queues": Array [],
            "stats": Object {},
          }
        `
        );
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
        expect(JSON.parse(res.text)).toMatchInlineSnapshot(
          {
            stats: {
              blocked_clients: expect.any(String),
              connected_clients: expect.any(String),
              mem_fragmentation_ratio: expect.any(String),
              redis_version: expect.any(String),
              total_system_memory: expect.any(String),
              used_memory: expect.any(String),
            },
          },
          `
          Object {
            "queues": Array [
              Object {
                "counts": Object {
                  "active": 0,
                  "completed": 0,
                  "delayed": 0,
                  "failed": 0,
                  "paused": 0,
                  "waiting": 0,
                  "waiting-children": 0,
                },
                "isPaused": false,
                "jobs": Array [],
                "name": "Code",
                "pagination": Object {
                  "pageCount": 1,
                  "range": Object {
                    "end": 9,
                    "start": 0,
                  },
                },
                "readOnlyMode": false,
              },
            ],
            "stats": Object {
              "blocked_clients": Any<String>,
              "connected_clients": Any<String>,
              "mem_fragmentation_ratio": Any<String>,
              "redis_version": Any<String>,
              "total_system_memory": Any<String>,
              "used_memory": Any<String>,
            },
          }
        `
        );
      });
  });
});
