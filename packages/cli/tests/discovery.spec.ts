import BullQueue from 'bull';
import { Queue as BullMQQueue } from 'bullmq';
import { Redis } from 'ioredis';
import { discoverQueues, probeQueues } from '../src/discovery';

const redisOptions = { host: 'localhost', port: +(process.env.REDIS_PORT || 6379) };

describe('discoverQueues', () => {
  let client: Redis;
  const created: Array<{ close(): Promise<void> }> = [];

  beforeAll(async () => {
    client = new Redis({ ...redisOptions, maxRetriesPerRequest: null });

    const bullmq = new BullMQQueue('cli-discovery-mq', { connection: redisOptions });
    const foreign = new BullMQQueue('cli-discovery-foreign', {
      connection: redisOptions,
      prefix: 'other-prefix',
    });
    const bull = new BullQueue('cli-discovery-bull', { redis: redisOptions });

    await bullmq.waitUntilReady();
    await foreign.waitUntilReady();
    await bull.add('seed', {});

    await client.set('bull:cli-discovery:eu:meta', '{}');

    created.push(bullmq, foreign, bull);
  });

  afterAll(async () => {
    await Promise.all(created.map((queue) => queue.close()));
    const keys = await client.keys('*cli-discovery*');
    if (keys.length > 0) {
      await client.del(...keys);
    }
    await client.quit();
  });

  it('finds BullMQ queues under the default prefix', async () => {
    const found = await discoverQueues(client, ['bull']);

    expect(found).toContainEqual({ prefix: 'bull', name: 'cli-discovery-mq', lib: 'bullmq' });
  });

  it('classifies a Bull queue as bull, not bullmq', async () => {
    const found = await discoverQueues(client, ['bull']);

    expect(found).toContainEqual({ prefix: 'bull', name: 'cli-discovery-bull', lib: 'bull' });
  });

  it('recovers queue names that contain a colon', async () => {
    const found = await discoverQueues(client, ['bull']);

    expect(found).toContainEqual({ prefix: 'bull', name: 'cli-discovery:eu', lib: 'bullmq' });
  });

  it('ignores queues under other prefixes', async () => {
    const found = await discoverQueues(client, ['bull']);

    expect(found.map((queue) => queue.name)).not.toContain('cli-discovery-foreign');
  });

  it('finds queues under an explicit non-default prefix', async () => {
    const found = await discoverQueues(client, ['other-prefix']);

    expect(found).toContainEqual({
      prefix: 'other-prefix',
      name: 'cli-discovery-foreign',
      lib: 'bullmq',
    });
  });

  it('refuses a wildcard prefix rather than silently finding nothing', async () => {
    await expect(discoverQueues(client, ['*'])).rejects.toThrow(/Wildcard prefixes/);
  });

  it('returns a sorted, de-duplicated list when a prefix is repeated', async () => {
    const found = await discoverQueues(client, ['bull', 'bull']);
    const names = found.map((queue) => `${queue.prefix}:${queue.name}`);

    expect(new Set(names).size).toBe(names.length);
    expect([...names]).toEqual([...names].sort());
  });
});

describe('probeQueues', () => {
  let client: Redis;

  beforeAll(async () => {
    client = new Redis({ ...redisOptions, maxRetriesPerRequest: null });
    const queue = new BullMQQueue('cli-probe-mq', { connection: redisOptions });
    await queue.waitUntilReady();
    await queue.close();
  });

  afterAll(async () => {
    const keys = await client.keys('*cli-probe*');
    if (keys.length > 0) {
      await client.del(...keys);
    }
    await client.quit();
  });

  it('classifies a named queue that exists', async () => {
    await expect(probeQueues(client, 'bull', ['cli-probe-mq'])).resolves.toEqual([
      { prefix: 'bull', name: 'cli-probe-mq', lib: 'bullmq' },
    ]);
  });

  it('assumes bullmq for a named queue that does not exist yet', async () => {
    await expect(probeQueues(client, 'bull', ['cli-probe-absent'])).resolves.toEqual([
      { prefix: 'bull', name: 'cli-probe-absent', lib: 'bullmq' },
    ]);
  });
});
