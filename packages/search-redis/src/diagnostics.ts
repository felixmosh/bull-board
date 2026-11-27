import type {
  JobSearchCoverage,
  JobSearchInspection,
  JobSearchStatus,
} from '@bull-board/api/typings/app';
import type { Job, JobType } from 'bullmq';
import { HEARTBEAT_EVERY, HEARTBEAT_TTL } from './keys';
import { RedisSearchIndex } from './RedisSearchIndex';
import { retryOnSlotMove } from './retry';

const COVERAGE_TYPES: JobType[] = [
  'active',
  'waiting',
  'waiting-children',
  'prioritized',
  'delayed',
  'completed',
  'failed',
];

const COVERAGE_GRACE = 1000;

const optionalNumber = (value: string | undefined): number | undefined =>
  value === undefined ? undefined : Number(value);

export async function readStatus(index: RedisSearchIndex): Promise<JobSearchStatus> {
  const { keys, connection } = index;
  const [stats, heartbeat, heartbeatTtl, retries, indexed] = await retryOnSlotMove(async () => {
    const replies = await connection
      .multi()
      .hgetall(keys.stats)
      .get(keys.heartbeat)
      .pttl(keys.heartbeat)
      .scard(keys.retry)
      .zcard(keys.all)
      .exec();
    return (replies ?? []).map(([error, value]) => {
      if (error) throw error;
      return value;
    }) as [Record<string, string>, string | null, number, number, number];
  });

  const writeFailing = stats.writeFailingSince !== undefined;
  const pendingRetries = retries + (writeFailing ? Number(stats.writeFailingJobs ?? 0) : 0);
  const base = {
    indexedJobs: indexed,
    indexerLastSeenAt: heartbeat === null ? undefined : Number(heartbeat),
    lastEventAt: optionalNumber(stats.lastEventAt),
    pendingRetries,
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
  if (heartbeat === null || heartbeatTtl < HEARTBEAT_TTL - 2 * HEARTBEAT_EVERY) {
    return { ...base, health: 'down', reasons: ['INDEXER_NOT_SEEN'] };
  }

  const reasons: JobSearchStatus['reasons'] = [];
  if (pendingRetries > 0 || writeFailing) reasons.push('PENDING_RETRIES');
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
  const unknown = newest.filter((_, position) => !known[position]);
  if (unknown.length === 0) return { checked: newest.length, missing: [] };

  await new Promise((resolve) => setTimeout(resolve, COVERAGE_GRACE));
  const [later, existing] = await Promise.all([
    index.known(unknown),
    Promise.all(unknown.map((jobId) => index.queue.getJob(jobId))),
  ]);
  return {
    checked: newest.length,
    missing: unknown.filter((_, position) => !later[position] && existing[position]),
  };
}
