import type { Job, JobType, Queue } from 'bullmq';
import { RedisSearchIndex } from './RedisSearchIndex';

export interface BackfillResult {
  jobs: number;
  durationMs: number;
}

const STATES: JobType[] = [
  'waiting',
  'prioritized',
  'delayed',
  'waiting-children',
  'active',
  'completed',
  'failed',
];

function rangeTypesOf(queue: Queue, state: JobType): JobType[] {
  const hasPausedState = typeof (queue as { getBackend?: unknown }).getBackend !== 'function';
  return hasPausedState && state === 'waiting' ? [state, 'paused' as JobType] : [state];
}

export async function backfillQueue(
  index: RedisSearchIndex,
  batchSize: number,
  signal?: AbortSignal,
  missingOnly = false
): Promise<BackfillResult> {
  const startedAt = Date.now();
  const { queue } = index;
  let jobs = 0;

  for (const state of STATES) {
    for (let start = 0; !signal?.aborted; start += batchSize) {
      const ids = await queue.getRanges(
        rangeTypesOf(queue, state),
        start,
        start + batchSize - 1,
        false
      );
      let toRead = ids;
      if (missingOnly && ids.length > 0) {
        const known = await index.known(ids);
        toRead = ids.filter((_, i) => !known[i]);
      }
      const found = (await Promise.all(toRead.map((jobId) => queue.getJob(jobId)))).filter(
        (job): job is Job => Boolean(job?.id)
      );
      await index.indexJobs(found);
      jobs += found.length;
      if (ids.length < batchSize) break;
    }
  }

  return { jobs, durationMs: Date.now() - startedAt };
}
