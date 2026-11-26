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

function statesOf(queue: Queue): JobType[] {
  const hasPausedState = typeof (queue as { getBackend?: unknown }).getBackend !== 'function';
  return hasPausedState ? [...STATES, 'paused' as JobType] : STATES;
}

export async function backfillQueue(
  index: RedisSearchIndex,
  batchSize: number,
  signal?: AbortSignal
): Promise<BackfillResult> {
  const startedAt = Date.now();
  let jobs = 0;

  for (const state of statesOf(index.queue)) {
    for (let start = 0; !signal?.aborted; start += batchSize) {
      const page = await index.queue.getJobs([state], start, start + batchSize - 1, false);
      if (page.length === 0) break;
      const found = page.filter((job): job is Job => Boolean(job?.id));
      await index.indexJobs(found);
      jobs += found.length;
    }
  }

  return { jobs, durationMs: Date.now() - startedAt };
}
