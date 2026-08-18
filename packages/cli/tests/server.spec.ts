import { createBullBoard } from '@bull-board/api';
import { ExpressAdapter } from '@bull-board/express';
import { Queue as BullMQQueue } from 'bullmq';
import { Redis } from 'ioredis';
import request from 'supertest';
import { parseFlags } from '../src/config/flags';
import { resolveConfig } from '../src/config/resolve';
import { createQueueFactory } from '../src/queueFactory';
import { QueueRegistry } from '../src/registry';
import { startServer } from '../src/server';

const redisOptions = { host: 'localhost', port: +(process.env.REDIS_PORT || 6379) };
const QUEUE_NAME = 'cli-server-spec';

async function boot(argv: string[]) {
  const config = resolveConfig({
    flags: parseFlags(['--port', '0', '--no-open', ...argv]),
    env: {} as NodeJS.ProcessEnv,
    file: {},
  });
  const client = new Redis({ ...redisOptions, maxRetriesPerRequest: null });
  await new Promise<void>((resolve) => client.once('ready', () => resolve()));
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath(config.basePath);
  const board = createBullBoard({
    queues: [],
    serverAdapter,
    options: { uiConfig: config.uiConfig },
  });
  const queues = createQueueFactory({
    client,
    readOnly: config.readOnly,
    queueOptions: {},
    onWarning: () => undefined,
  });
  const registry = new QueueRegistry({
    board,
    createQueue: queues.createQueue,
    onWarning: () => undefined,
  });
  await registry.sync([{ prefix: 'bull', name: QUEUE_NAME, lib: 'bullmq' }]);
  const server = await startServer(config, { serverAdapter });

  return {
    server,
    async teardown() {
      await server.close();
      await registry.close();
      await queues.close();
      await client.quit();
    },
  };
}

describe('startServer', () => {
  let seeded: BullMQQueue;

  beforeAll(async () => {
    seeded = new BullMQQueue(QUEUE_NAME, { connection: redisOptions });
    await seeded.waitUntilReady();
  });

  afterAll(async () => {
    await seeded.obliterate({ force: true });
    await seeded.close();
  });

  it('serves the queue list', async () => {
    const { server, teardown } = await boot([]);

    try {
      const response = await request(server.app).get('/api/queues');

      expect(response.status).toBe(200);
      expect(response.body.queues.map((queue: { name: string }) => queue.name)).toContain(
        QUEUE_NAME
      );
    } finally {
      await teardown();
    }
  });

  it('serves under a base path', async () => {
    const { server, teardown } = await boot(['--base-path', '/queues']);

    try {
      expect((await request(server.app).get('/queues/api/queues')).status).toBe(200);
    } finally {
      await teardown();
    }
  });

  it('rejects an unauthenticated request when auth is configured', async () => {
    const { server, teardown } = await boot(['--user', 'admin', '--password', 'secret']);

    try {
      expect((await request(server.app).get('/api/queues')).status).toBe(401);
    } finally {
      await teardown();
    }
  });

  it('accepts correct credentials', async () => {
    const { server, teardown } = await boot(['--user', 'admin', '--password', 'secret']);

    try {
      const response = await request(server.app).get('/api/queues').auth('admin', 'secret');

      expect(response.status).toBe(200);
    } finally {
      await teardown();
    }
  });

  it('rejects wrong credentials and challenges', async () => {
    const { server, teardown } = await boot(['--user', 'admin', '--password', 'secret']);

    try {
      const response = await request(server.app).get('/api/queues').auth('admin', 'wrong');

      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toMatch(/^Basic /);
    } finally {
      await teardown();
    }
  });

  it('reports the port it actually bound, not the one it was asked for', async () => {
    const { server, teardown } = await boot([]);

    try {
      expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(server.url).not.toContain(':0');
    } finally {
      await teardown();
    }
  });
});
