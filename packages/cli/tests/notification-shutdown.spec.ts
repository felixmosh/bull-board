import { Redis } from 'ioredis';
import { subscribeBullMQ } from '../src/notifications/subscribe';

test('closes an owned event connection before Redis becomes ready', async () => {
  const client = new Redis({
    host: '127.0.0.1',
    port: 1,
    maxRetriesPerRequest: null,
    retryStrategy: () => 50,
  });
  client.on('error', () => undefined);
  const duplicate = client.duplicate.bind(client);
  const owned: Redis[] = [];
  const spy = jest.spyOn(client, 'duplicate').mockImplementation((options) => {
    const copy = duplicate(options);
    owned.push(copy);
    return copy;
  });
  const unsubscribe = subscribeBullMQ(
    { name: 'shutdown', prefix: 'bull', lib: 'bullmq' },
    client,
    () => undefined,
    () => undefined
  );
  try {
    const closed = unsubscribe().then(() => true);
    const completed = await Promise.race([
      closed,
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 300)),
    ]);
    expect(completed).toBe(true);
    expect(owned).toHaveLength(1);
    expect(owned[0].status).toBe('end');
  } finally {
    for (const copy of owned) copy.disconnect();
    client.disconnect();
    spy.mockRestore();
    void unsubscribe().catch(() => undefined);
  }
});
