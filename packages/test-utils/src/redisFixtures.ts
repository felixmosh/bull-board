import { Queue } from 'bullmq';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';

export const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT || 6379),
};

export interface SeededQueue {
  name: string;
  queue: Queue;
  // TODO: parametrize on queue backend (BullMQ axis) when contract is extended
  adapter: BullMQAdapter;
  close: () => Promise<void>;
}

let counter = 0;

/** Create a uniquely-named BullMQ queue, seed one waiting job. */
export async function seedQueue(prefix = 'contract'): Promise<SeededQueue> {
  const name = `${prefix}-${process.pid}-${counter++}`;
  const queue = new Queue(name, { connection });
  await queue.waitUntilReady();
  await queue.add('seed-job', { hello: 'world' });
  return {
    name,
    queue,
    adapter: new BullMQAdapter(queue),
    close: async () => {
      await queue.obliterate({ force: true }).catch(() => undefined);
      await queue.close();
    },
  };
}
