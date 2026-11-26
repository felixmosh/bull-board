import type {
  JobSearchCoverage,
  JobSearchInspection,
  JobSearchStatus,
} from '@bull-board/api/typings/app';
import type { Job, JobType } from 'bullmq';
import { RedisSearchIndex } from './RedisSearchIndex';

const COVERAGE_TYPES: JobType[] = [
  'active',
  'waiting',
  'waiting-children',
  'prioritized',
  'delayed',
  'completed',
  'failed',
];

const optionalNumber = (value: string | undefined): number | undefined =>
  value === undefined ? undefined : Number(value);

export async function readStatus(index: RedisSearchIndex): Promise<JobSearchStatus> {
  const { keys, connection } = index;
  const replies = await connection
    .multi()
    .hgetall(keys.stats)
    .get(keys.heartbeat)
    .scard(keys.retry)
    .zcard(keys.all)
    .exec();
  const [stats, heartbeat, retries, indexed] = (replies ?? []).map(([error, value]) => {
    if (error) throw error;
    return value;
  }) as [Record<string, string>, string | null, number, number];

  const base = {
    indexedJobs: indexed,
    indexerLastSeenAt: heartbeat === null ? undefined : Number(heartbeat),
    lastEventAt: optionalNumber(stats.lastEventAt),
    pendingRetries: retries,
    lastBackfill:
      stats.backfillFinishedAt === undefined
        ? undefined
        : {
            finishedAt: Number(stats.backfillFinishedAt),
            jobs: Number(stats.backfillJobs),
            durationMs: Number(stats.backfillDurationMs),
          },
    lastSweep:
      stats.sweepFinishedAt === undefined
        ? undefined
        : {
            finishedAt: Number(stats.sweepFinishedAt),
            checked: Number(stats.sweepChecked),
            removed: Number(stats.sweepRemoved),
          },
  };

  if (stats.startedAt === undefined) {
    return { ...base, health: 'down', reasons: ['INDEXER_NEVER_STARTED'] };
  }
  if (heartbeat === null) {
    return { ...base, health: 'down', reasons: ['INDEXER_NOT_SEEN'] };
  }

  const reasons: JobSearchStatus['reasons'] = [];
  if (retries > 0) reasons.push('PENDING_RETRIES');
  if (stats.backfillRunning === '1') reasons.push('BACKFILL_RUNNING');
  return { ...base, health: reasons.length > 0 ? 'degraded' : 'ok', reasons };
}

export async function inspectJob(
  index: RedisSearchIndex,
  jobId: string
): Promise<JobSearchInspection> {
  const job = await index.queue.getJob(jobId);
  const entries = index.fieldNames.map((name) => ({
    field: name,
    values: job ? (index.field(name)?.values(job) ?? []) : [],
  }));

  if (!job) {
    return { fields: entries.map((entry) => ({ ...entry, indexed: false })) };
  }

  const pipeline = index.connection.pipeline();
  for (const entry of entries) {
    for (const value of entry.values) {
      pipeline.zscore(index.keys.value(entry.field, value), jobId);
    }
  }
  const replies = (await pipeline.exec()) ?? [];

  let cursor = 0;
  const fields = entries.map((entry) => {
    let indexed = entry.values.length > 0;
    for (let i = 0; i < entry.values.length; i++) {
      const [error, score] = replies[cursor++];
      if (error) throw error;
      if (score === null) indexed = false;
    }
    return { ...entry, indexed };
  });
  return { fields };
}

export async function checkCoverage(
  index: RedisSearchIndex,
  sample: number
): Promise<JobSearchCoverage> {
  const jobs = await index.queue.getJobs(COVERAGE_TYPES, 0, sample - 1, false);
  const unique = new Map<string, Job>();
  for (const job of jobs) {
    if (job?.id !== undefined) unique.set(job.id, job);
  }
  const newest = [...unique.values()]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, sample)
    .map((job) => job.id as string);

  const known = await index.known(newest);
  return { checked: newest.length, missing: newest.filter((_, position) => !known[position]) };
}
