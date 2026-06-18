import { Queue } from 'bullmq';

export const redisOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
};

export const queueName = 'NextjsQueue';

// Reuse one Queue across dev hot-reloads to avoid leaking Redis connections.
const globalForQueue = globalThis as unknown as { bullQueue?: Queue };

export const queue =
  globalForQueue.bullQueue ?? new Queue(queueName, { connection: redisOptions });

if (process.env.NODE_ENV !== 'production') {
  globalForQueue.bullQueue = queue;
}
