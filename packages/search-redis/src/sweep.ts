import { RedisSearchIndex } from './RedisSearchIndex';

export interface SweepResult {
  checked: number;
  removed: number;
  dense: boolean;
}

interface SweepCommands {
  bbSearchSweepRange(all: string, position: string, batch: number): Promise<string[]>;
}

export async function sweepOnce(index: RedisSearchIndex, batch: number): Promise<SweepResult> {
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

  const jobs = await Promise.all(jobIds.map((jobId) => queue.getJob(jobId)));
  const dead = jobIds.filter((_, i) => !jobs[i]);
  await index.removeJobs(dead);

  if (jobIds.length < batch) {
    await connection.del(keys.sweep);
  } else {
    const last = jobIds.length - 1;
    await connection.set(keys.sweep, `${scores[last]}:${jobIds[last]}`);
  }

  return { checked: jobIds.length, removed: dead.length, dense: dead.length * 2 > batch };
}
