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
  signal?: AbortSignal
): Promise<BackfillResult> {
  const startedAt = Date.now();
  let jobs = 0;

  for (const state of STATES) {
    for (let start = 0; !signal?.aborted; start += batchSize) {
      const end = start + batchSize - 1;
      const page = await index.queue.getJobs([state], start, end, false);
      const found = page.filter((job): job is Job => Boolean(job?.id));
      await index.indexJobs(found);
      jobs += found.length;
      if (page.length < batchSize) {
        const ids = await index.queue.getRanges(
          rangeTypesOf(index.queue, state),
          start,
          end,
          false
        );
        if (ids.length < batchSize) break;
      }
    }
  }

  return { jobs, durationMs: Date.now() - startedAt };
}
