import type { Job } from 'bullmq';
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
  const missing = jobIds.filter((_, i) => !jobs[i]);
  await index.removeJobs(missing);
  const back = (await Promise.all(missing.map((jobId) => queue.getJob(jobId)))).filter(
    (job): job is Job => Boolean(job)
  );
  await index.indexJobs(back);
  const removed = missing.length - back.length;

  if (jobIds.length < batch) {
    await connection.del(keys.sweep);
  } else {
    const last = jobIds.length - 1;
    await connection.set(keys.sweep, `${scores[last]}:${jobIds[last]}`);
  }

  return { checked: jobIds.length, removed, dense: removed * 2 > batch };
}
