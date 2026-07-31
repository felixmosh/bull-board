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
