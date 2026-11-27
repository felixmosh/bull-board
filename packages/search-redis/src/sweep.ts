import type { Job, Queue } from 'bullmq';
import { RedisSearchIndex } from './RedisSearchIndex';

export interface SweepResult {
  checked: number;
  removed: number;
  dense: boolean;
  wrapped: boolean;
}

export interface QueueClient {
  isCluster?: boolean;
  exists(key: string): Promise<number>;
  pipeline(): {
    exists?(key: string): unknown;
    exec(): Promise<[Error | null, unknown][] | null>;
  };
}

interface VersionedQueue {
  client?: Promise<QueueClient>;
  getBackend?: () => { client?: Promise<QueueClient> } | undefined;
}

interface SweepCommands {
  bbSearchSweepRange(all: string, position: string, batch: number): Promise<string[]>;
}

export async function queueClient(queue: Queue): Promise<QueueClient> {
  const versioned = queue as unknown as VersionedQueue;
  const client =
    typeof versioned.getBackend === 'function'
      ? await versioned.getBackend()?.client
      : await versioned.client;
  if (!client) throw new Error(`The queue ${queue.name} has no Redis client to sweep with`);
  return client;
}

export async function existing(client: QueueClient, keys: string[]): Promise<boolean[]> {
  const pipeline = client.isCluster ? undefined : client.pipeline();
  if (!pipeline?.exists) {
    return (await Promise.all(keys.map((key) => client.exists(key)))).map(Boolean);
  }
  for (const key of keys) pipeline.exists(key);
  return ((await pipeline.exec()) ?? []).map(([error, count]) => {
    if (error) throw error;
    return Boolean(count);
  });
}

export async function sweepOnce(
  index: RedisSearchIndex,
  client: QueueClient,
  batch: number
): Promise<SweepResult> {
  const { connection, keys, queue } = index;
  const reply = await (connection as unknown as SweepCommands).bbSearchSweepRange(
    keys.all,
    keys.sweep,
    batch
  );

  const jobIds: string[] = [];
  const scores: string[] = [];
  for (let i = 0; i < reply.length; i += 2) {
    jobIds.push(reply[i]);
    scores.push(reply[i + 1]);
  }

  const found = await existing(
    client,
    jobIds.map((jobId) => queue.toKey(jobId))
  );
  const missing = jobIds.filter((_, i) => !found[i]);
  await index.removeJobs(missing);
  const back = (await Promise.all(missing.map((jobId) => queue.getJob(jobId)))).filter(
    (job): job is Job => Boolean(job)
  );
  await index.indexJobs(back);
  const removed = missing.length - back.length;

  const wrapped = jobIds.length < batch;
  if (wrapped) {
    await connection.del(keys.sweep);
  } else {
    const last = jobIds.length - 1;
    await connection.set(keys.sweep, `${scores[last]}:${jobIds[last]}`);
  }

  return { checked: jobIds.length, removed, dense: removed * 2 > batch, wrapped };
}
