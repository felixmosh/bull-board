import { Queue } from 'bullmq';
import { BullMQAdapter } from '../../src/queueAdapters/bullMQ';

describe('BullMQAdapter.getQueueKey', () => {
  const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: +(process.env.REDIS_PORT || 6379),
  };
  let queue: Queue;

  afterEach(async () => {
    await queue?.close();
  });

  it('returns the fully prefixed key for a set', () => {
    queue = new Queue('KeyQueue', { connection });
    const adapter = new BullMQAdapter(queue);
    expect(adapter.getQueueKey('completed')).toBe('bull:KeyQueue:completed');
  });

  it('honours a custom BullMQ prefix', () => {
    queue = new Queue('KeyQueue', { connection, prefix: 'custom' });
    const adapter = new BullMQAdapter(queue);
    expect(adapter.getQueueKey('completed')).toBe('custom:KeyQueue:completed');
  });
});

describe('BullMQAdapter.getJobs', () => {
  const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: +(process.env.REDIS_PORT || 6379),
  };
  let queue: Queue;

  beforeEach(async () => {
    queue = new Queue('HoleQueue', { connection });
    await queue.obliterate({ force: true }).catch(() => {});
  });

  afterEach(async () => {
    await queue.obliterate({ force: true }).catch(() => {});
    await queue.close();
  });

  // BullMQ resolves a status set to ids and then each id to a job, so an id left behind by a
  // deleted job hash comes back as `undefined`. Callers are typed for jobs, not holes.
  it('omits ids whose job data is gone', async () => {
    const kept = await queue.add('kept', {});
    const lost = await queue.add('lost', {});
    const client = await queue.client;
    await client.del(queue.toKey(lost.id as string));

    const jobs = await new BullMQAdapter(queue).getJobs(['waiting']);

    expect(jobs.map((job) => job?.id)).toEqual([kept.id]);
  });
});
