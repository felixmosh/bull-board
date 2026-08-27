import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { Queue } from 'bullmq';

export const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT || 6379),
};

export interface SeededQueue {
  name: string;
  queue: Queue;
  adapter: BullMQAdapter;
  /** Id of the job scheduler seeded alongside the job, for the scheduler routes. */
  schedulerId: string;
  close: () => Promise<void>;
}

let counter = 0;

/** Create a uniquely-named BullMQ queue, seed one waiting job and one job scheduler. */
export async function seedQueue(prefix = 'contract'): Promise<SeededQueue> {
  const name = `${prefix}-${process.pid}-${counter++}`;
  const schedulerId = 'contract-scheduler';
  const queue = new Queue(name, { connection });
  await queue.waitUntilReady();
  await queue.add('seed-job', { hello: 'world' });
  await queue.upsertJobScheduler(
    schedulerId,
    { pattern: '0 3 * * *' },
    { name: 'scheduled-task', data: { seeded: true } }
  );
  return {
    name,
    queue,
    adapter: new BullMQAdapter(queue),
    schedulerId,
    close: async () => {
      await queue.obliterate({ force: true }).catch(() => undefined);
      await queue.close();
    },
  };
}
